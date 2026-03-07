import { PrismaClient, PlanType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Sports
  const sports = await Promise.all([
    prisma.sport.upsert({ where: { slug: 'nba' }, update: {}, create: { name: 'NBA', slug: 'nba' } }),
    prisma.sport.upsert({ where: { slug: 'nfl' }, update: {}, create: { name: 'NFL', slug: 'nfl' } }),
    prisma.sport.upsert({ where: { slug: 'mlb' }, update: {}, create: { name: 'MLB', slug: 'mlb' } }),
    prisma.sport.upsert({ where: { slug: 'nhl' }, update: {}, create: { name: 'NHL', slug: 'nhl' } }),
    prisma.sport.upsert({ where: { slug: 'ncaaf' }, update: {}, create: { name: 'NCAAF', slug: 'ncaaf' } }),
    prisma.sport.upsert({ where: { slug: 'ncaab' }, update: {}, create: { name: 'NCAAB', slug: 'ncaab' } }),
  ]);
  const nba = sports[0];
  console.log('✅ Sports seeded');

  // Sportsbooks
  const books = await Promise.all([
    prisma.book.upsert({ where: { slug: 'draftkings' }, update: {}, create: { name: 'DraftKings', slug: 'draftkings' } }),
    prisma.book.upsert({ where: { slug: 'fanduel' }, update: {}, create: { name: 'FanDuel', slug: 'fanduel' } }),
    prisma.book.upsert({ where: { slug: 'betmgm' }, update: {}, create: { name: 'BetMGM', slug: 'betmgm' } }),
    prisma.book.upsert({ where: { slug: 'caesars' }, update: {}, create: { name: 'Caesars', slug: 'caesars' } }),
  ]);
  console.log('✅ Books seeded');

  // NBA Teams
  const teamsData = [
    { name: 'Boston Celtics', abbreviation: 'BOS', city: 'Boston', conference: 'East', division: 'Atlantic' },
    { name: 'Brooklyn Nets', abbreviation: 'BKN', city: 'Brooklyn', conference: 'East', division: 'Atlantic' },
    { name: 'New York Knicks', abbreviation: 'NYK', city: 'New York', conference: 'East', division: 'Atlantic' },
    { name: 'Philadelphia 76ers', abbreviation: 'PHI', city: 'Philadelphia', conference: 'East', division: 'Atlantic' },
    { name: 'Toronto Raptors', abbreviation: 'TOR', city: 'Toronto', conference: 'East', division: 'Atlantic' },
    { name: 'Chicago Bulls', abbreviation: 'CHI', city: 'Chicago', conference: 'East', division: 'Central' },
    { name: 'Cleveland Cavaliers', abbreviation: 'CLE', city: 'Cleveland', conference: 'East', division: 'Central' },
    { name: 'Detroit Pistons', abbreviation: 'DET', city: 'Detroit', conference: 'East', division: 'Central' },
    { name: 'Indiana Pacers', abbreviation: 'IND', city: 'Indianapolis', conference: 'East', division: 'Central' },
    { name: 'Milwaukee Bucks', abbreviation: 'MIL', city: 'Milwaukee', conference: 'East', division: 'Central' },
    { name: 'Atlanta Hawks', abbreviation: 'ATL', city: 'Atlanta', conference: 'East', division: 'Southeast' },
    { name: 'Charlotte Hornets', abbreviation: 'CHA', city: 'Charlotte', conference: 'East', division: 'Southeast' },
    { name: 'Miami Heat', abbreviation: 'MIA', city: 'Miami', conference: 'East', division: 'Southeast' },
    { name: 'Orlando Magic', abbreviation: 'ORL', city: 'Orlando', conference: 'East', division: 'Southeast' },
    { name: 'Washington Wizards', abbreviation: 'WAS', city: 'Washington', conference: 'East', division: 'Southeast' },
    { name: 'Denver Nuggets', abbreviation: 'DEN', city: 'Denver', conference: 'West', division: 'Northwest' },
    { name: 'Minnesota Timberwolves', abbreviation: 'MIN', city: 'Minneapolis', conference: 'West', division: 'Northwest' },
    { name: 'Oklahoma City Thunder', abbreviation: 'OKC', city: 'Oklahoma City', conference: 'West', division: 'Northwest' },
    { name: 'Portland Trail Blazers', abbreviation: 'POR', city: 'Portland', conference: 'West', division: 'Northwest' },
    { name: 'Utah Jazz', abbreviation: 'UTA', city: 'Salt Lake City', conference: 'West', division: 'Northwest' },
    { name: 'Golden State Warriors', abbreviation: 'GSW', city: 'San Francisco', conference: 'West', division: 'Pacific' },
    { name: 'LA Clippers', abbreviation: 'LAC', city: 'Los Angeles', conference: 'West', division: 'Pacific' },
    { name: 'Los Angeles Lakers', abbreviation: 'LAL', city: 'Los Angeles', conference: 'West', division: 'Pacific' },
    { name: 'Phoenix Suns', abbreviation: 'PHX', city: 'Phoenix', conference: 'West', division: 'Pacific' },
    { name: 'Sacramento Kings', abbreviation: 'SAC', city: 'Sacramento', conference: 'West', division: 'Pacific' },
    { name: 'Dallas Mavericks', abbreviation: 'DAL', city: 'Dallas', conference: 'West', division: 'Southwest' },
    { name: 'Houston Rockets', abbreviation: 'HOU', city: 'Houston', conference: 'West', division: 'Southwest' },
    { name: 'Memphis Grizzlies', abbreviation: 'MEM', city: 'Memphis', conference: 'West', division: 'Southwest' },
    { name: 'New Orleans Pelicans', abbreviation: 'NOP', city: 'New Orleans', conference: 'West', division: 'Southwest' },
    { name: 'San Antonio Spurs', abbreviation: 'SAS', city: 'San Antonio', conference: 'West', division: 'Southwest' },
  ];

  const teams: Record<string, any> = {};
  for (const t of teamsData) {
    const team = await prisma.team.upsert({
      where: { sportId_abbreviation: { sportId: nba.id, abbreviation: t.abbreviation } },
      update: {},
      create: { ...t, sportId: nba.id },
    });
    teams[t.abbreviation] = team;
  }
  console.log('✅ Teams seeded');

  // Players
  const playersData = [
    { teamAbbr: 'BOS', name: 'Jayson Tatum', position: 'SF', jerseyNumber: '0', age: 26 },
    { teamAbbr: 'BOS', name: 'Jaylen Brown', position: 'SG', jerseyNumber: '7', age: 27 },
    { teamAbbr: 'LAL', name: 'LeBron James', position: 'SF', jerseyNumber: '23', age: 39 },
    { teamAbbr: 'LAL', name: 'Anthony Davis', position: 'C', jerseyNumber: '3', age: 31 },
    { teamAbbr: 'GSW', name: 'Stephen Curry', position: 'PG', jerseyNumber: '30', age: 36 },
    { teamAbbr: 'GSW', name: 'Draymond Green', position: 'PF', jerseyNumber: '23', age: 34 },
    { teamAbbr: 'MIL', name: 'Giannis Antetokounmpo', position: 'PF', jerseyNumber: '34', age: 29 },
    { teamAbbr: 'DEN', name: 'Nikola Jokic', position: 'C', jerseyNumber: '15', age: 29 },
    { teamAbbr: 'DEN', name: 'Jamal Murray', position: 'PG', jerseyNumber: '27', age: 27 },
    { teamAbbr: 'PHX', name: 'Kevin Durant', position: 'SF', jerseyNumber: '35', age: 35 },
    { teamAbbr: 'PHI', name: 'Joel Embiid', position: 'C', jerseyNumber: '21', age: 30 },
    { teamAbbr: 'MIA', name: 'Jimmy Butler', position: 'SF', jerseyNumber: '22', age: 34 },
    { teamAbbr: 'DAL', name: 'Luka Doncic', position: 'PG', jerseyNumber: '77', age: 25 },
    { teamAbbr: 'DAL', name: 'Kyrie Irving', position: 'PG', jerseyNumber: '11', age: 32 },
    { teamAbbr: 'OKC', name: 'Shai Gilgeous-Alexander', position: 'PG', jerseyNumber: '2', age: 26 },
    { teamAbbr: 'MIN', name: 'Anthony Edwards', position: 'SG', jerseyNumber: '5', age: 23 },
    { teamAbbr: 'NOP', name: 'Zion Williamson', position: 'PF', jerseyNumber: '1', age: 24 },
    { teamAbbr: 'NYK', name: 'Jalen Brunson', position: 'PG', jerseyNumber: '11', age: 28 },
    { teamAbbr: 'SAC', name: 'De\'Aaron Fox', position: 'PG', jerseyNumber: '5', age: 26 },
    { teamAbbr: 'CLE', name: 'Donovan Mitchell', position: 'SG', jerseyNumber: '45', age: 28 },
  ];

  for (const p of playersData) {
    const team = teams[p.teamAbbr];
    if (team) {
      await prisma.player.create({
        data: { teamId: team.id, name: p.name, position: p.position, jerseyNumber: p.jerseyNumber, age: p.age },
      });
    }
  }
  console.log('✅ Players seeded');

  // Events
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const dayAfter = new Date(now.getTime() + 2 * 86400000);

  const eventsData = [
    { homeAbbr: 'BOS', awayAbbr: 'NYK', startTime: tomorrow, season: '2024-25' },
    { homeAbbr: 'LAL', awayAbbr: 'GSW', startTime: tomorrow, season: '2024-25' },
    { homeAbbr: 'MIL', awayAbbr: 'PHI', startTime: tomorrow, season: '2024-25' },
    { homeAbbr: 'DEN', awayAbbr: 'DAL', startTime: dayAfter, season: '2024-25' },
    { homeAbbr: 'MIA', awayAbbr: 'ATL', startTime: dayAfter, season: '2024-25' },
    { homeAbbr: 'PHX', awayAbbr: 'OKC', startTime: dayAfter, season: '2024-25' },
    { homeAbbr: 'MIN', awayAbbr: 'LAC', startTime: dayAfter, season: '2024-25' },
    { homeAbbr: 'SAC', awayAbbr: 'POR', startTime: dayAfter, season: '2024-25' },
  ];

  for (const e of eventsData) {
    const homeTeam = teams[e.homeAbbr];
    const awayTeam = teams[e.awayAbbr];
    if (homeTeam && awayTeam) {
      const event = await prisma.event.create({
        data: {
          sportId: nba.id,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          startTime: e.startTime,
          season: e.season,
          status: 'SCHEDULED',
        },
      });

      // Create markets for each event
      const market = await prisma.market.create({
        data: { eventId: event.id, sportId: nba.id, marketType: 'MONEYLINE' },
      });

      const spreadMarket = await prisma.market.create({
        data: { eventId: event.id, sportId: nba.id, marketType: 'SPREAD' },
      });

      const totalMarket = await prisma.market.create({
        data: { eventId: event.id, sportId: nba.id, marketType: 'TOTAL' },
      });

      // Create odds for each book
      const oddsVariations = [
        { odds: -110 + Math.random() * 20 - 10, line: -3.5 + Math.random() * 2 - 1 },
        { odds: -115 + Math.random() * 15 - 7, line: -4.0 + Math.random() * 2 - 1 },
        { odds: -105 + Math.random() * 20 - 10, line: -3.0 + Math.random() * 2 - 1 },
        { odds: -112 + Math.random() * 18 - 9, line: -3.5 + Math.random() * 2 - 1 },
      ];

      for (let i = 0; i < books.length; i++) {
        const book = books[i];
        const variation = oddsVariations[i];

        await prisma.marketOdds.createMany({
          data: [
            { marketId: market.id, bookId: book.id, outcome: 'home', odds: -150 + Math.random() * 60 - 30 },
            { marketId: market.id, bookId: book.id, outcome: 'away', odds: 130 + Math.random() * 40 - 20 },
            { marketId: spreadMarket.id, bookId: book.id, outcome: 'home', odds: -110, line: variation.line },
            { marketId: spreadMarket.id, bookId: book.id, outcome: 'away', odds: -110, line: -variation.line },
            { marketId: totalMarket.id, bookId: book.id, outcome: 'over', odds: -110, line: 220 + Math.random() * 20 - 10 },
            { marketId: totalMarket.id, bookId: book.id, outcome: 'under', odds: -110, line: 220 + Math.random() * 20 - 10 },
          ],
        });
      }
    }
  }
  console.log('✅ Events & markets seeded');

  // Test users
  const hash = await bcrypt.hash('Password123!', 10);
  await Promise.all([
    prisma.user.upsert({
      where: { email: 'free@test.com' },
      update: {},
      create: { email: 'free@test.com', password: hash, firstName: 'Free', lastName: 'User', planType: PlanType.FREE },
    }),
    prisma.user.upsert({
      where: { email: 'pro@test.com' },
      update: {},
      create: { email: 'pro@test.com', password: hash, firstName: 'Pro', lastName: 'User', planType: PlanType.PRO },
    }),
    prisma.user.upsert({
      where: { email: 'premium@test.com' },
      update: {},
      create: { email: 'premium@test.com', password: hash, firstName: 'Premium', lastName: 'User', planType: PlanType.PREMIUM },
    }),
  ]);
  console.log('✅ Users seeded');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
