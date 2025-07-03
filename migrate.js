import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'hot-daddy.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

const appliedMigrations = db.prepare('SELECT name FROM _migrations').all().map(row => row.name);
console.log('Already applied migrations:', appliedMigrations.length > 0 ? appliedMigrations.join(', ') : 'None');

const migrationsDir = path.join(__dirname, 'migrations');
const availableMigrations = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

console.log('Found migration files:', availableMigrations.join(', '));

const migrationsToRun = availableMigrations.filter(file => !appliedMigrations.includes(file));

if (migrationsToRun.length === 0) {
  console.log('Database is already up to date.');
  db.close();
  process.exit(0);
}

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