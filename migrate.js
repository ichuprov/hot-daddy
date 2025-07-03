const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'hot-daddy.db'));

// 1. Create a table to track which migrations have been run.
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// 2. Get the list of migrations that have already been run from the database.
const appliedMigrations = db.prepare('SELECT name FROM _migrations').all().map(row => row.name);
console.log('Already applied migrations:', appliedMigrations.length > 0 ? appliedMigrations.join(', ') : 'None');

// 3. Get the list of all available migration files from the filesystem.
const migrationsDir = path.join(__dirname, 'migrations');
const availableMigrations = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort(); // Sort them alphabetically/numerically

console.log('Found migration files:', availableMigrations.join(', '));

// 4. Determine which migrations to run.
const migrationsToRun = availableMigrations.filter(file => !appliedMigrations.includes(file));

if (migrationsToRun.length === 0) {
  console.log('Database is already up to date.');
  db.close();
  return;
}

// 5. Run each new migration inside a transaction.
console.log('Applying new migrations:', migrationsToRun.join(', '));
migrationsToRun.forEach(file => {
  const migrationPath = path.join(migrationsDir, file);
  const script = fs.readFileSync(migrationPath, 'utf8');

  const runMigration = db.transaction(() => {
    db.exec(script);
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
  });

  try {
    runMigration();
    console.log(`Successfully applied migration: ${file}`);
  } catch (err) {
    console.error(`Failed to apply migration ${file}:`, err);
    process.exit(1);
  }
});

console.log('All new migrations applied successfully.');
db.close();