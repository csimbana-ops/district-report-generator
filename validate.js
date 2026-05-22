const fs = require('fs');
const path = require('path');
require('dotenv').config();
const pool = require('./src/config/database');

console.log(`
╔════════════════════════════════════════════════════════╗
║     Validador de Configuración - Reportes              ║
║     Fecha: ${new Date().toLocaleDateString()}                ║
╚════════════════════════════════════════════════════════╝
`);

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

function pass(msg) {
  console.log(`✅ ${msg}`);
  checks.passed++;
}

function fail(msg) {
  console.log(`❌ ${msg}`);
  checks.failed++;
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
  checks.warnings++;
}

async function validateSetup() {
  console.log('\n📋 VALIDANDO ESTRUCTURA DE CARPETAS...\n');

  // Carpetas
  const folders = [
    'src',
    'src/config',
    'src/services',
    'src/routes',
    'src/controllers',
    'src/templates',
    'img',
    'output',
  ];

  folders.forEach((folder) => {
    const folderPath = path.join(__dirname, folder);
    if (fs.existsSync(folderPath)) {
      pass(`Carpeta existe: ${folder}`);
    } else {
      fail(`Carpeta falta: ${folder}`);
    }
  });

  console.log('\n📝 VALIDANDO ARCHIVOS CRÍTICOS...\n');

  // Archivos
  const files = [
    'package.json',
    '.env',
    'src/index.js',
    'src/config/database.js',
    'src/config/constants.js',
    'src/services/reportService.js',
    'src/services/renderService.js',
    'src/controllers/reportController.js',
    'src/routes/reportRoutes.js',
    'src/templates/reportTemplate.html',
  ];

  files.forEach((file) => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      pass(`Archivo existe: ${file}`);
    } else {
      fail(`Archivo falta: ${file}`);
    }
  });

  console.log('\n🔐 VALIDANDO VARIABLES DE ENTORNO...\n');

  const requiredEnvVars = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASS',
    'DB_NAME',
  ];

  requiredEnvVars.forEach((envVar) => {
    if (process.env[envVar]) {
      pass(`Variable de entorno definida: ${envVar}`);
    } else {
      fail(`Variable de entorno falta: ${envVar}`);
    }
  });

  console.log('\n🔌 VALIDANDO CONEXIÓN A BASE DE DATOS...\n');

  try {
    const result = await pool.query('SELECT NOW()');
    pass('Conexión a PostgreSQL exitosa');
    pass(`Servidor BD respondió: ${result.rows[0].now}`);
  } catch (error) {
    fail('No se pudo conectar a PostgreSQL');
    console.error(`   Error: ${error.message}`);
  }

  console.log('\n🎨 VALIDANDO TEMPLATE HTML...\n');

  const templatePath = path.join(__dirname, 'src/templates/reportTemplate.html');
  if (fs.existsSync(templatePath)) {
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    if (templateContent.includes('<%') && templateContent.includes('%>')) {
      pass('Template HTML contiene sintaxis EJS');
    } else {
      warn('Template HTML no tiene sintaxis EJS detectada');
    }

    const expectedSections = [
      'metric-card',
      'metric-value',
      'table',
      'out-of-line',
    ];
    expectedSections.forEach((section) => {
      if (templateContent.includes(section)) {
        pass(`Template contiene sección: ${section}`);
      } else {
        warn(`Template podría no tener sección: ${section}`);
      }
    });
  }

  console.log('\n📦 VALIDANDO NODE_MODULES...\n');

  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    pass('node_modules existe');
  } else {
    fail('node_modules no existe. Ejecuta: npm install');
  }

  const requiredModules = ['express', 'pg', 'ejs', 'dotenv'];
  requiredModules.forEach((module) => {
    const modulePath = path.join(__dirname, 'node_modules', module);
    if (fs.existsSync(modulePath)) {
      pass(`Módulo instalado: ${module}`);
    } else {
      fail(`Módulo falta: ${module}. Ejecuta: npm install`);
    }
  });

  console.log('\n🖼️  VALIDANDO LOGOS...\n');

  const imgPath = path.join(__dirname, 'img');
  if (fs.existsSync(imgPath)) {
    const logos = fs.readdirSync(imgPath);
    if (logos.length > 0) {
      pass(`Carpeta img tiene ${logos.length} archivo(s)`);
      logos.forEach((logo) => {
        pass(`  - ${logo}`);
      });
    } else {
      warn('Carpeta img está vacía (logos son opcionales)');
    }
  }

  console.log('\n📊 RESUMEN FINAL\n');
  console.log(`✅ Validaciones exitosas: ${checks.passed}`);
  console.log(`❌ Validaciones fallidas: ${checks.failed}`);
  console.log(`⚠️  Advertencias: ${checks.warnings}`);

  if (checks.failed === 0) {
    console.log(`
╔════════════════════════════════════════════════════════╗
║  ✨ ¡SETUP COMPLETO Y LISTO PARA USAR!                ║
║                                                        ║
║  Para iniciar el servidor, ejecuta:                   ║
║    npm start       (producción)                       ║
║    npm run dev     (desarrollo con auto-reload)       ║
║                                                        ║
║  Luego abre: http://localhost:3000/api/health         ║
╚════════════════════════════════════════════════════════╝
    `);
  } else {
    console.log(`
╔════════════════════════════════════════════════════════╗
║  ⚠️  Hay problemas en la configuración                ║
║                                                        ║
║  Por favor, revisa los errores arriba (❌) y          ║
║  sigue el README.md para resolverlos                  ║
╚════════════════════════════════════════════════════════╝
    `);
  }

  // Cerrar pool
  await pool.end();
}

// Ejecutar validación
validateSetup().catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});
