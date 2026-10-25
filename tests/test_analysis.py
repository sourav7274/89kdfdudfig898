import sqlite3
import unittest
from backend.analysis import decision_inputs, decision_view, review_view


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE forecasts(start_time TEXT, publish_time TEXT, generation_mw REAL);
            CREATE TABLE actuals(start_time TEXT, publish_time TEXT, generation_mw REAL);
        """)

    def tearDown(self):
        self.db.close()

    def forecast(self, start, published, value):
        self.db.execute("INSERT INTO forecasts VALUES (?,?,?)", (start, published, value))

    def actual(self, start, published, value):
        self.db.execute("INSERT INTO actuals VALUES (?,?,?)", (start, published, value))

    def test_cutoff_inclusive_and_late_revision_excluded(self):
        for published, value in [("08:00:00Z", 1000), ("09:00:00Z", 2000),
                                 ("09:00:00.001Z", 9999)]:
            self.forecast("2026-01-02T17:00:00Z", "2026-01-01T" + published, value)
        result = decision_view(self.db, "2026-01-01")
        self.assertEqual(result["forecasts"][17]["forecast_mw"], 2000)
        self.assertNotIn("actual_mw", result["forecasts"][17])
        self.assertIsNone(result["historical_accuracy"]["mae_mw"])

    def test_hourly_mean_missing_half_and_explicit_zero(self):
        for hour in (17, 18, 19):
            self.forecast(f"2026-01-02T{hour}:00:00Z", "2026-01-01T08:00:00Z", 1000)
        for target, value in [("17:00", 6000), ("17:30", 5000), ("18:00", 0),
                              ("19:00", 0), ("19:30", 0)]:
            self.actual(f"2026-01-02T{target}:00Z", "2026-01-03T00:00:00Z", value)
        result = review_view(self.db, "2026-01-01")
        self.assertEqual(result["periods"][17]["signed_error_mw"], -4500)
        self.assertIsNone(result["periods"][18]["actual_mw"])
        self.assertEqual(result["periods"][19]["actual_mw"], 0)
        self.assertEqual(result["metrics"]["matched_hours"], 2)
        self.assertEqual(result["metrics"]["mae_mw"], 2750)
        self.assertEqual(result["metrics"]["average_signed_error_mw"], -1750)

    def test_history_uses_own_forecast_cutoff_and_available_actual_versions(self):
        self.forecast("2026-01-02T00:00:00Z", "2026-01-01T08:00:00Z", 1000)
        self.forecast("2026-01-02T00:00:00Z", "2026-01-02T08:00:00Z", 9000)
        for target in ("00:00", "00:30"):
            self.actual(f"2026-01-02T{target}:00Z", "2026-01-02T01:00:00Z", 500)
            self.actual(f"2026-01-02T{target}:00Z", "2026-01-04T01:00:00Z", 9999)
        self.forecast("2026-01-03T00:00:00Z", "2026-01-02T08:00:00Z", 2000)
        result = decision_view(self.db, "2026-01-03")
        self.assertEqual(result["historical_accuracy"]["decision_dates"], ["2026-01-01"])
        self.assertEqual(result["historical_accuracy"]["mae_mw"], 500)

    def test_actual_published_after_current_cutoff_is_excluded(self):
        self.forecast("2026-01-02T00:00:00Z", "2026-01-01T08:00:00Z", 1000)
        for target in ("00:00", "00:30"):
            self.actual(f"2026-01-02T{target}:00Z", "2026-01-03T10:00:00Z", 500)
        self.assertEqual(decision_view(self.db, "2026-01-03")["historical_accuracy"]["matched_hours"], 0)

    def test_january_boundary_and_input_validation(self):
        self.assertEqual(decision_view(self.db, "2026-01-31")["delivery_date"], "2026-02-01")
        for day, cutoff in [("2026-02-01", "09:00"), ("2026-01-32", "09:00"),
                            ("2026-01-01", "24:00")]:
            with self.assertRaises(ValueError):
                decision_inputs(day, cutoff)


if __name__ == "__main__":
    unittest.main()
