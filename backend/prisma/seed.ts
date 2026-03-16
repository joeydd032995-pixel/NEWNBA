import { PrismaClient, PlanType, PropStatType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(2)}s`;
}

async function seedStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`✅ ${label} (${elapsed(start)})`);
    return result;
  } catch (err) {
    console.error(`❌ ${label} FAILED after ${elapsed(start)}:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

async function main() {
  const seedStart = Date.now();
  console.log(`🌱 Seeding database... (${new Date().toISOString()})`);

  // Sports
  const sports = await seedStep('Sports seeded', () => Promise.all([
    prisma.sport.upsert({ where: { slug: 'nba' }, update: {}, create: { name: 'NBA', slug: 'nba' } }),
    prisma.sport.upsert({ where: { slug: 'nfl' }, update: {}, create: { name: 'NFL', slug: 'nfl' } }),
    prisma.sport.upsert({ where: { slug: 'mlb' }, update: {}, create: { name: 'MLB', slug: 'mlb' } }),
    prisma.sport.upsert({ where: { slug: 'nhl' }, update: {}, create: { name: 'NHL', slug: 'nhl' } }),
    prisma.sport.upsert({ where: { slug: 'ncaaf' }, update: {}, create: { name: 'NCAAF', slug: 'ncaaf' } }),
    prisma.sport.upsert({ where: { slug: 'ncaab' }, update: {}, create: { name: 'NCAAB', slug: 'ncaab' } }),
  ]));
  const nba = sports[0];

  // Sportsbooks
  const books = await seedStep('Books seeded', () => Promise.all([
    prisma.book.upsert({ where: { slug: 'draftkings' }, update: {}, create: { name: 'DraftKings', slug: 'draftkings' } }),
    prisma.book.upsert({ where: { slug: 'fanduel' }, update: {}, create: { name: 'FanDuel', slug: 'fanduel' } }),
    prisma.book.upsert({ where: { slug: 'betmgm' }, update: {}, create: { name: 'BetMGM', slug: 'betmgm' } }),
    prisma.book.upsert({ where: { slug: 'caesars' }, update: {}, create: { name: 'Caesars', slug: 'caesars' } }),
  ]));

  // Test users — create early so login works even if later seed steps fail
  await seedStep('Users seeded', async () => {
    const [hashAdmin, hashPro, hashUser] = await Promise.all([
      bcrypt.hash('admin123', 12),
      bcrypt.hash('pro123', 12),
      bcrypt.hash('user123', 12),
    ]);
    return Promise.all([
      prisma.user.upsert({
        where: { email: 'admin@newnba.com' },
        update: {},
        create: { email: 'admin@newnba.com', password: hashAdmin, firstName: 'Admin', lastName: 'User', planType: PlanType.PREMIUM },
      }),
      prisma.user.upsert({
        where: { email: 'pro@newnba.com' },
        update: {},
        create: { email: 'pro@newnba.com', password: hashPro, firstName: 'Pro', lastName: 'User', planType: PlanType.PRO },
      }),
      prisma.user.upsert({
        where: { email: 'user@newnba.com' },
        update: {},
        create: { email: 'user@newnba.com', password: hashUser, firstName: 'Free', lastName: 'User', planType: PlanType.FREE },
      }),
    ]);
  });

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
  await seedStep(`Teams seeded (${teamsData.length} teams)`, async () => {
    for (const t of teamsData) {
      const team = await prisma.team.upsert({
        where: { sportId_abbreviation: { sportId: nba.id, abbreviation: t.abbreviation } },
        update: {},
        create: { ...t, sportId: nba.id },
      });
      teams[t.abbreviation] = team;
    }
  });

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

  await seedStep(`Players seeded (${playersData.length} players)`, async () => {
    for (const p of playersData) {
      const team = teams[p.teamAbbr];
      if (team) {
        await prisma.player.create({
          data: { teamId: team.id, name: p.name, position: p.position, jerseyNumber: p.jerseyNumber, age: p.age },
        }).catch(() => null); // skip duplicates on re-seed
      }
    }
  });

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

  await seedStep(`Events & markets seeded (${eventsData.length} events)`, async () => {
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
  });

  // ─── Historical events + StatLines ───────────────────────────────────────
  // Player stat profiles: [avg, stddev] per stat
  const playerProfiles: Record<string, {
    pts: [number, number]; reb: [number, number]; ast: [number, number];
    stl: [number, number]; blk: [number, number]; fg3m: [number, number];
    min: [number, number]; fgm: [number, number]; fga: [number, number];
    ftm: [number, number]; fta: [number, number];
  }> = {
    'Jayson Tatum':              { pts:[27,5],  reb:[8,2],  ast:[4.5,1.5], stl:[1,0.5], blk:[0.8,0.5], fg3m:[3,1.2], min:[36,3], fgm:[10,2],  fga:[21,3],  ftm:[6,2],  fta:[7,2] },
    'Jaylen Brown':              { pts:[23,5],  reb:[5,1.5],ast:[3.5,1.2], stl:[1,0.5], blk:[0.5,0.4], fg3m:[2,1],   min:[34,3], fgm:[9,2],   fga:[19,3],  ftm:[4,1.5],fta:[5,2] },
    'LeBron James':              { pts:[25,5],  reb:[7,2],  ast:[8,2],     stl:[1.3,0.6],blk:[0.6,0.4],fg3m:[2,1],   min:[35,3], fgm:[10,2],  fga:[19,3],  ftm:[5,2],  fta:[6,2] },
    'Anthony Davis':             { pts:[26,5],  reb:[12,2.5],ast:[3,1],    stl:[1.1,0.5],blk:[2.3,0.8],fg3m:[0.3,0.5],min:[35,3],fgm:[10,2],  fga:[18,3],  ftm:[6,2],  fta:[8,2.5]},
    'Stephen Curry':             { pts:[29,5],  reb:[5,1.5],ast:[6,2],     stl:[1.5,0.6],blk:[0.3,0.3],fg3m:[5,1.5], min:[34,3], fgm:[10,2],  fga:[20,3],  ftm:[4,1.5],fta:[5,2] },
    'Draymond Green':            { pts:[9,3],   reb:[7,2],  ast:[6,2],     stl:[1,0.5], blk:[0.8,0.5], fg3m:[0.5,0.7],min:[30,4], fgm:[3,1],   fga:[7,2],   ftm:[2,1],  fta:[3,1.5]},
    'Giannis Antetokounmpo':     { pts:[30,5],  reb:[11,2.5],ast:[5.5,2],  stl:[1.1,0.5],blk:[1.4,0.6],fg3m:[0.5,0.7],min:[33,3],fgm:[11,2],  fga:[19,3],  ftm:[8,3],  fta:[11,3.5]},
    'Nikola Jokic':              { pts:[26,5],  reb:[12,2.5],ast:[9,2.5],  stl:[1.3,0.6],blk:[0.9,0.5],fg3m:[0.8,0.8],min:[34,3],fgm:[10,2],  fga:[17,3],  ftm:[6,2],  fta:[7,2.5]},
    'Jamal Murray':              { pts:[21,5],  reb:[4,1.5],ast:[6.5,2],   stl:[0.9,0.5],blk:[0.4,0.4],fg3m:[2.5,1.2],min:[34,3],fgm:[8,2],   fga:[17,3],  ftm:[3,1.5],fta:[4,2] },
    'Kevin Durant':              { pts:[27,5],  reb:[6.5,2],ast:[5,1.5],   stl:[0.8,0.5],blk:[1.1,0.5],fg3m:[2,1],   min:[36,3], fgm:[11,2],  fga:[20,3],  ftm:[5,2],  fta:[6,2.5]},
    'Joel Embiid':               { pts:[33,6],  reb:[10,2.5],ast:[4.2,1.5],stl:[1,0.5], blk:[1.7,0.7], fg3m:[1.2,0.9],min:[33,4], fgm:[11,2.5],fga:[19,3.5],ftm:[10,3.5],fta:[13,4]},
    'Jimmy Butler':              { pts:[22,5],  reb:[5.5,1.5],ast:[5,1.5], stl:[1.5,0.6],blk:[0.5,0.4],fg3m:[1,0.8], min:[33,3], fgm:[8,2],   fga:[16,3],  ftm:[6,2.5],fta:[7,3] },
    'Luka Doncic':               { pts:[33,6],  reb:[9,2.5],ast:[9.5,2.5], stl:[1.4,0.6],blk:[0.5,0.4],fg3m:[3,1.5], min:[35,3], fgm:[12,2.5],fga:[25,4],  ftm:[7,2.5],fta:[8,3] },
    'Kyrie Irving':              { pts:[24,5],  reb:[5,1.5],ast:[5,1.5],   stl:[1.3,0.6],blk:[0.5,0.4],fg3m:[3,1.3], min:[34,3], fgm:[9,2],   fga:[19,3],  ftm:[3,1.5],fta:[4,2] },
    'Shai Gilgeous-Alexander':   { pts:[30,5],  reb:[5,1.5],ast:[6,1.5],   stl:[2,0.7], blk:[0.9,0.5], fg3m:[1.5,1], min:[34,3], fgm:[11,2],  fga:[21,3],  ftm:[7,2.5],fta:[9,3] },
    'Anthony Edwards':           { pts:[25,5],  reb:[5,1.5],ast:[5,1.5],   stl:[1.3,0.6],blk:[0.6,0.4],fg3m:[3.5,1.5],min:[34,3],fgm:[9,2],   fga:[21,4],  ftm:[4,2],  fta:[5,2.5]},
    'Zion Williamson':           { pts:[26,5],  reb:[7,2],  ast:[4.5,1.5], stl:[0.9,0.5],blk:[0.6,0.4],fg3m:[0.1,0.3],min:[30,4], fgm:[10,2],  fga:[17,3],  ftm:[6,2.5],fta:[8,3] },
    'Jalen Brunson':             { pts:[28,5],  reb:[3.5,1.2],ast:[6.5,2], stl:[0.9,0.5],blk:[0.2,0.3],fg3m:[3,1.2], min:[34,3], fgm:[10,2],  fga:[20,3],  ftm:[5,2],  fta:[6,2.5]},
    "De'Aaron Fox":              { pts:[26,5],  reb:[4.5,1.5],ast:[6,2],   stl:[1.5,0.6],blk:[0.5,0.4],fg3m:[2,1],   min:[34,3], fgm:[10,2],  fga:[20,3],  ftm:[4,1.5],fta:[5,2] },
    'Donovan Mitchell':          { pts:[28,5],  reb:[4,1.5],ast:[4.5,1.5], stl:[1.5,0.6],blk:[0.4,0.4],fg3m:[3,1.3], min:[34,3], fgm:[10,2],  fga:[21,3],  ftm:[5,2],  fta:[6,2.5]},
  };

  function gauss(mean: number, std: number): number {
    // Box-Muller transform
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round((mean + std * z) * 10) / 10);
  }

  // Get all seeded players
  const allPlayers = await prisma.player.findMany({ include: { team: true } });

  // Create 20 historical events (past 60 days)
  const teamList = Object.values(teams);
  const historicalEvents: any[] = [];
  await seedStep('Historical events seeded', async () => {
    for (let i = 0; i < 20; i++) {
      const daysAgo = 3 + i * 3; // every 3 days going back
      const gameDate = new Date(now.getTime() - daysAgo * 86400000);
      const homeIdx = i % teamList.length;
      const awayIdx = (i + 5) % teamList.length;
      if (homeIdx === awayIdx) continue;
      const evt = await prisma.event.create({
        data: {
          sportId: nba.id,
          homeTeamId: teamList[homeIdx].id,
          awayTeamId: teamList[awayIdx].id,
          startTime: gameDate,
          season: '2024-25',
          status: 'FINAL',
          homeScore: Math.floor(Math.random() * 25 + 100),
          awayScore: Math.floor(Math.random() * 25 + 100),
        },
      });
      historicalEvents.push(evt);
    }
    return historicalEvents;
  });

  // Seed StatLines for each player across historical events
  const profiledPlayers = allPlayers.filter(p => playerProfiles[p.name]);
  await seedStep(`Historical stat lines seeded (${profiledPlayers.length} players × ${Math.min(17, historicalEvents.length)} games)`, async () => {
    for (const player of profiledPlayers) {
      const profile = playerProfiles[player.name];
      const gameSubset = historicalEvents.slice(0, 17);
      for (const evt of gameSubset) {
        const pts  = gauss(profile.pts[0],  profile.pts[1]);
        const reb  = gauss(profile.reb[0],  profile.reb[1]);
        const ast  = gauss(profile.ast[0],  profile.ast[1]);
        const stl  = gauss(profile.stl[0],  profile.stl[1]);
        const blk  = gauss(profile.blk[0],  profile.blk[1]);
        const fg3m = gauss(profile.fg3m[0], profile.fg3m[1]);
        const min  = gauss(profile.min[0],  profile.min[1]);
        const fgm  = gauss(profile.fgm[0],  profile.fgm[1]);
        const fga  = Math.max(fgm + 2, gauss(profile.fga[0], profile.fga[1]));
        const ftm  = gauss(profile.ftm[0],  profile.ftm[1]);
        const fta  = Math.max(ftm, gauss(profile.fta[0], profile.fta[1]));
        await prisma.statLine.create({
          data: {
            playerId: player.id,
            eventId: evt.id,
            season: '2024-25',
            gameDate: evt.startTime,
            points: pts, rebounds: reb, assists: ast, steals: stl, blocks: blk,
            turnovers: gauss(2, 1), minutes: min,
            fgm, fga, fgPct: fga > 0 ? fgm / fga : 0,
            fg3m, fg3a: Math.max(fg3m, gauss(profile.fg3m[0] * 2.5, 1.5)),
            fg3Pct: fg3m > 0 ? Math.random() * 0.15 + 0.33 : 0,
            ftm, fta, ftPct: fta > 0 ? ftm / fta : 0,
            plusMinus: gauss(0, 10), usgPct: gauss(0.25, 0.05),
            tsPct: fga > 0 ? pts / (2 * (fga + 0.475 * fta)) : 0,
            efgPct: fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0,
            bpm: gauss(profile.pts[0] / 10, 2),
          },
        }).catch(() => null); // skip dupes on re-seed
      }
    }
  });

  // ─── Player Prop Markets for upcoming events ──────────────────────────────
  const propConfigs: Array<{ stat: PropStatType; label: string; getLine: (p: string) => number }> = [
    { stat: PropStatType.POINTS,   label: 'Points',           getLine: (n) => Math.round((playerProfiles[n]?.pts[0]  ?? 20) - 1.5) + 0.5 },
    { stat: PropStatType.REBOUNDS, label: 'Rebounds',         getLine: (n) => Math.round((playerProfiles[n]?.reb[0]  ?? 5)  - 0.5) + 0.5 },
    { stat: PropStatType.ASSISTS,  label: 'Assists',          getLine: (n) => Math.round((playerProfiles[n]?.ast[0]  ?? 4)  - 0.5) + 0.5 },
    { stat: PropStatType.THREES,   label: '3-Pointers Made',  getLine: (n) => Math.round((playerProfiles[n]?.fg3m[0] ?? 2)  - 0.5) + 0.5 },
    { stat: PropStatType.PRA,      label: 'Pts+Reb+Ast',      getLine: (n) => {
      const p = playerProfiles[n]; if (!p) return 29.5;
      return Math.round(p.pts[0] + p.reb[0] + p.ast[0] - 2) + 0.5;
    }},
    { stat: PropStatType.PR,       label: 'Pts+Reb',          getLine: (n) => {
      const p = playerProfiles[n]; if (!p) return 19.5;
      return Math.round(p.pts[0] + p.reb[0] - 1.5) + 0.5;
    }},
  ];

  // Only create props for players who have a profile (our star players)
  const starPlayers = allPlayers.filter(p => playerProfiles[p.name]);

  for (const evt of [...eventsData.map((_, i) => i)]) {
    // Get the seeded event — we'll use prisma to get upcoming events
  }

  // Get upcoming events
  const upcomingEvents = await prisma.event.findMany({
    where: { status: 'SCHEDULED' },
    include: { homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } },
  });

  let propCount = 0;
  await seedStep(`Player prop markets seeded (${upcomingEvents.length} events)`, async () => {
    for (const upEvt of upcomingEvents) {
      const eventPlayers = [
        ...upEvt.homeTeam.players,
        ...upEvt.awayTeam.players,
      ].filter(p => playerProfiles[p.name]);

      for (const player of eventPlayers) {
        // Create all markets for this player in parallel
        const marketsWithCfg = await Promise.all(
          propConfigs.map(async (cfg) => {
            const line = cfg.getLine(player.name);
            const market = await prisma.market.create({
              data: {
                eventId: upEvt.id,
                sportId: nba.id,
                marketType: 'PLAYER_PROP',
                playerId: player.id,
                propStatType: cfg.stat,
                description: `${player.name} ${cfg.label} O/U ${line}`,
              },
            });
            return { market, line };
          })
        );

        // Batch all odds for this player's markets in one createMany
        const oddsData: Array<{ marketId: string; bookId: string; outcome: string; odds: number; line: number }> = [];
        for (const { market, line } of marketsWithCfg) {
          const baseOver  = -115 + Math.floor(Math.random() * 21) - 10;
          const baseUnder = -115 + Math.floor(Math.random() * 21) - 10;
          for (const book of books) {
            const bookVar = Math.floor(Math.random() * 11) - 5;
            oddsData.push(
              { marketId: market.id, bookId: book.id, outcome: 'over',  odds: baseOver  + bookVar, line },
              { marketId: market.id, bookId: book.id, outcome: 'under', odds: baseUnder + bookVar, line },
            );
          }
        }
        await prisma.marketOdds.createMany({ data: oddsData });
        propCount += marketsWithCfg.length;
      }
    }
    console.log(`  → ${propCount} prop markets created`);
  });

  console.log(`🎉 Seeding complete! Total time: ${elapsed(seedStart)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
