const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'gestion-formation.db');

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);

      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS salles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          capacite INTEGER NOT NULL,
          equipements TEXT,
          date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
          date_modification DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS formations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          apprenants INTEGER NOT NULL,
          debut DATE NOT NULL,
          fin DATE NOT NULL,
          besoins TEXT,
          date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
          date_modification DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS affectations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          formation_id INTEGER NOT NULL,
          salle_id INTEGER NOT NULL,
          date DATE NOT NULL,
          date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (formation_id) REFERENCES formations(id),
          FOREIGN KEY (salle_id) REFERENCES salles(id)
        )`);
        
        db.run('CREATE INDEX IF NOT EXISTS idx_affectations_formation ON affectations(formation_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_affectations_salle ON affectations(salle_id)');

        resolve(db); // Retourner l'instance db pour qu'elle soit accessible
      });
    });
  });
};

const validateFormation = (formation) => {
  if (!formation.nom || formation.apprenants < 1 || !formation.debut || !formation.fin) {
    throw new Error('Données de formation invalides');
  }
  if (new Date(formation.debut) > new Date(formation.fin)) {
    throw new Error('La date de début doit être antérieure à la date de fin');
  }
};

const validateSalle = (salle) => {
  if (!salle.nom || salle.capacite < 1) {
    throw new Error('Données de salle invalides');
  }
};

module.exports = {
  initDatabase, // Exporter initDatabase pour initialiser db
  getSalles: (db) => new Promise((resolve, reject) => {
    db.all('SELECT * FROM salles ORDER BY nom', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }),
  addSalle: (db, salle) => new Promise((resolve, reject) => {
    validateSalle(salle);
    const stmt = db.prepare('INSERT INTO salles (nom, capacite, equipements) VALUES (?, ?, ?)');
    stmt.run(salle.nom, salle.capacite, salle.equipements, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, ...salle });
      stmt.finalize();
    });
  }),
  updateSalle: (db, salle) => new Promise((resolve, reject) => {
    validateSalle(salle);
    const stmt = db.prepare('UPDATE salles SET nom = ?, capacite = ?, equipements = ?, date_modification = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(salle.nom, salle.capacite, salle.equipements, salle.id, function (err) {
      if (err) reject(err);
      else resolve({ ...salle });
      stmt.finalize();
    });
  }),
  deleteSalle: (db, id) => new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM affectations WHERE salle_id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (row.count > 0) return reject(new Error('Salle utilisée dans des affectations'));
      const stmt = db.prepare('DELETE FROM salles WHERE id = ?');
      stmt.run(id, function (err) {
        if (err) reject(err);
        else resolve({ success: true, id });
        stmt.finalize();
      });
    });
  }),
  getFormations: (db) => new Promise((resolve, reject) => {
    db.all('SELECT * FROM formations ORDER BY debut', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }),
  addFormation: (db, formation) => new Promise((resolve, reject) => {
    validateFormation(formation);
    const stmt = db.prepare('INSERT INTO formations (nom, apprenants, debut, fin, besoins) VALUES (?, ?, ?, ?, ?)');
    stmt.run(formation.nom, formation.apprenants, formation.debut, formation.fin, formation.besoins, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, ...formation });
      stmt.finalize();
    });
  }),
  updateFormation: (db, formation) => new Promise((resolve, reject) => {
    validateFormation(formation);
    const stmt = db.prepare('UPDATE formations SET nom = ?, apprenants = ?, debut = ?, fin = ?, besoins = ?, date_modification = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(formation.nom, formation.apprenants, formation.debut, formation.fin, formation.besoins, formation.id, function (err) {
      if (err) reject(err);
      else resolve({ ...formation });
      stmt.finalize();
    });
  }),
  deleteFormation: (db, id) => new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run('DELETE FROM affectations WHERE formation_id = ?', [id], (err) => {
        if (err) {
          db.run('ROLLBACK');
          return reject(err);
        }
        db.run('DELETE FROM formations WHERE id = ?', [id], (err) => {
          if (err) {
            db.run('ROLLBACK');
            return reject(err);
          }
          db.run('COMMIT', (err) => {
            if (err) return reject(err);
            resolve({ success: true, id });
          });
        });
      });
    });
  }),
  getAffectations: (db) => new Promise((resolve, reject) => {
    const query = `
      SELECT a.id, a.date, a.date_creation,
             f.id as formation_id, f.nom as formation_nom, f.apprenants, f.debut, f.fin, f.besoins,
             s.id as salle_id, s.nom as salle_nom, s.capacite, s.equipements
      FROM affectations a
      JOIN formations f ON a.formation_id = f.id
      JOIN salles s ON a.salle_id = s.id
      ORDER BY a.date
    `;
    db.all(query, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }),
  addAffectation: (db, affectation) => new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO affectations (formation_id, salle_id, date, date_creation) 
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      affectation.formation_id,
      affectation.salle_id,
      affectation.date,
      affectation.date_creation || new Date().toISOString(),
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...affectation });
        stmt.finalize();
      }
    );
  }),
  optimiserAffectations: (db) => new Promise((resolve, reject) => {
    db.all(`
      SELECT f.id as formation_id, f.nom as formation_nom, f.apprenants, f.debut, f.fin, f.besoins,
             s.id as salle_id, s.nom as salle_nom, s.capacite, s.equipements
      FROM formations f
      LEFT JOIN affectations a ON f.id = a.formation_id
      LEFT JOIN salles s ON a.salle_id = s.id
      WHERE a.id IS NULL AND f.debut >= DATE('now')
      ORDER BY f.debut
    `, async (err, formations) => {
      if (err) return reject(err);
      if (!formations || formations.length === 0) {
        return resolve([]); // Pas de formations à optimiser
      }

      const suggestions = [];
      for (const f of formations) {
        try {
          const sallesDisponibles = await new Promise((resolveSalles, rejectSalles) => {
            db.all(`
              SELECT * FROM salles 
              WHERE capacite >= ? AND (equipements LIKE ? OR equipements IS NULL)
              AND id NOT IN (SELECT salle_id FROM affectations WHERE date = ?)
            `, [f.apprenants, `%${f.besoins}%`, f.debut], (err, salles) => {
              if (err) rejectSalles(err);
              else resolveSalles(salles);
            });
          });

          if (sallesDisponibles && sallesDisponibles.length > 0) {
            const salle = sallesDisponibles.reduce((best, current) => 
              current.capacite - f.apprenants < best.capacite - f.apprenants ? current : best
            );
            suggestions.push({
              formation_id: f.formation_id,
              formation_nom: f.formation_nom,
              apprenants: f.apprenants,
              date: f.debut,
              salle_id: salle.id,
              salle_nom: salle.nom,
              capacite: salle.capacite,
              optimisation: Math.round((f.apprenants / salle.capacite) * 100)
            });
          }
        } catch (error) {
          reject(error);
        }
      }
      resolve(suggestions);
    });
  }),
};
