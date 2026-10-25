"""Integration checks against the saved source snapshot."""
import unittest
import httpx
from backend.app import app


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_all_january_decisions_and_reviews(self):
        for day in range(1, 32):
            params = {"decision_date": f"2026-01-{day:02d}"}
            decision = await self.client.get("/api/decision", params=params)
            self.assertEqual(decision.status_code, 200)
            data = decision.json()
            self.assertEqual(data["forecast_coverage"]["available_hours"], 24)
            self.assertEqual(data["historical_accuracy"]["matched_hours"], max(0, day - 2) * 24)
            for period in data["forecasts"]:
                self.assertNotIn("actual_mw", period)
                self.assertLessEqual(period["forecast_publish_time"], data["cutoff"])
            review = await self.client.get("/api/review", params=params)
            self.assertEqual(review.status_code, 200)
            self.assertEqual(review.json()["metrics"]["matched_hours"], 24)

    async def test_health_and_invalid_requests(self):
        health = await self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertGreater(health.json()["records"]["forecasts"], 0)
        snapshot = await self.client.get("/api/snapshot")
        self.assertEqual(snapshot.status_code, 200)
        self.assertEqual(len(snapshot.json()["snapshot_id"]), 20)
        self.assertEqual(snapshot.json()["records"], health.json()["records"])
        self.assertEqual(snapshot.headers["cache-control"], "no-store")
        for params in [{"decision_date": "2026-01-32"}, {"decision_date": "2026-02-01"},
                       {"decision_date": "2026-01-01", "cutoff": "24:00"}]:
            response = await self.client.get("/api/decision", params=params)
            self.assertEqual(response.status_code, 422)
