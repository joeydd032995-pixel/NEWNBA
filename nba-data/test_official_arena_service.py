import unittest

from official_arena_service import parse_team_profile


class OfficialArenaProfileParserTests(unittest.TestCase):
    def test_parses_current_nba_profile_city_and_arena(self):
        html = """
        <section>
          <h2>BACKGROUND</h2>
          <div>Founded</div><div>1949</div>
          <div>City</div><div>Philadelphia</div>
          <div>Arena</div><div>Xfinity Mobile Arena</div>
          <div>G-League</div><div>Delaware Blue Coats</div>
          <div>Head Coach</div><div>Nick Nurse</div>
        </section>
        """
        self.assertEqual(
            parse_team_profile(html),
            {"city": "Philadelphia", "arena": "Xfinity Mobile Arena"},
        )

    def test_returns_none_when_required_profile_fields_are_missing(self):
        self.assertIsNone(parse_team_profile("<html><body>No team background here</body></html>"))


if __name__ == "__main__":
    unittest.main()
