# Generador de Reportes de Distritos

Aplicación escalable construida con **Node.js + Express** para generar reportes visuales de distritos basados en datos de PostgreSQL.

## 📋 Características

- ✅ API REST para generar reportes bajo demanda
- ✅ Extracción de datos mediante query SQL optimizado
- ✅ Renderización de HTML con estilos modernos
- ✅ Soporte para logos de empresa (Base64 embebido)
- ✅ Métricas por nivel (1, 2, 3, 4 + Fuera de Línea)
- ✅ Tabla dinámica con información de tiendas
- ✅ Footer con tiendas fuera de línea
- ✅ Diseño responsive (mobile-friendly)
- ✅ Escalable para agregar PDF export después

## 🚀 Instalación

### Requisitos Previos
- **Node.js** v14+ (descargar desde https://nodejs.org)
- **PostgreSQL** con base de datos configurada
- **npm** (viene con Node.js)

### Pasos de Instalación

1. **Navega a la carpeta del proyecto:**
   ```bash
   cd "C:\GRITSEE\District Report Drop Data"
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Configura las variables de entorno (.env):**
   Edita el archivo `.env` con tus credenciales de PostgreSQL:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=tu_usuario
   DB_PASS=tu_contraseña
   DB_NAME=nombre_base_datos
   DB_SSL=false
   PORT=3000
   ```

4. **Coloca los logos de empresas (opcional):**
   Agrega archivos PNG en la carpeta `img/` con el patrón de nombre:
   ```
   img/{company_id}.png
   
   Ej: img/20.png (logo para empresa ID 20)
   ```

## 🏃 Ejecutar el Servidor

### Modo Normal
```bash
npm start
```

### Modo Desarrollo (con reinicio automático)
```bash
npm run dev
```

El servidor iniciará en `http://localhost:3000`

## 📡 Uso de la API

### Endpoints Disponibles

#### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

**Respuesta:**
```json
{
  "status": "OK",
  "message": "Servidor de reportes activo",
  "timestamp": "2026-04-27T10:30:00.000Z"
}
```

#### 2. Generar Reporte
```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{
    "district_name": "D-11",
    "d1": "2026-04-13",
    "d2": "2026-04-19"
  }'
```

**Parámetros:**
- `district_name` (string, requerido): Nombre del distrito/mercado (ej. `D-11`)
- `d1` (string, requerido): Fecha de inicio (YYYY-MM-DD)
- `d2` (string, requerido): Fecha de fin (YYYY-MM-DD)

**Respuesta:**
- Código 200: Retorna HTML renderizado (descargable/visualizable en navegador)
- Código 400: Parámetros inválidos
- Código 500: Error en servidor/base de datos

## 📁 Estructura del Proyecto

```
District Report Drop Data/
├── src/
│   ├── config/
│   │   ├── database.js          # Pool conexión PostgreSQL
│   │   └── constants.js         # Query SQL
│   ├── services/
│   │   ├── reportService.js     # Lógica de extracción y procesamiento
│   │   └── renderService.js     # Inyección de datos en HTML
│   ├── controllers/
│   │   └── reportController.js  # Orquestación de endpoints
│   ├── routes/
│   │   └── reportRoutes.js      # Definición de rutas
│   ├── templates/
│   │   └── reportTemplate.html  # Template HTML con EJS
│   └── index.js                 # Servidor Express principal
├── img/                         # Carpeta para logos de empresas
├── output/                      # Carpeta para reportes generados
├── .env                         # Variables de entorno (NO COMMITEAR)
├── .env.example                 # Plantilla de variables
├── .gitignore                   # Archivos a ignorar en Git
├── package.json                 # Dependencias del proyecto
├── Query.sql                    # Query original documentado
└── README.md                    # Este archivo
```

## 🔧 Tecnologías Usadas

- **Express.js** - Framework web
- **pg** - Driver PostgreSQL
- **EJS** - Templating engine
- **dotenv** - Gestión de variables de entorno
- **nodemon** - Auto-reinicio en desarrollo

## 📊 Estructura de Datos

### Entrada (POST /api/report)
```json
{
  "district_name": "D-11",
  "d1": "2026-04-13",
  "d2": "2026-04-19"
}
```

### Salida (HTML)
El HTML contiene:
- **Encabezado**: Logo (si existe) + Título + ID Empresa
- **Métricas**: 6 tarjetas con totales por nivel
- **Tabla**: Tiendas con puntuaciones y links a informes
- **Footer**: Lista de tiendas fuera de línea

## 🎨 Características de Diseño

- **Responsive**: Se adapta a dispositivos móviles
- **Modern UI**: Gradientes, sombras, transiciones
- **Imprimible**: Estilos para impresión optimizados
- **Accesible**: Estructura semántica HTML5

## 🚦 Estados de Tiendas

- **En Línea**: Tienen `informe_url` en la tabla principal
- **Fuera de Línea**: `informe_url IS NULL` (mostradas en footer)

## 🔮 Mejoras Futuras

- [ ] Exportar a PDF con Puppeteer
- [ ] Batch processing (múltiples reportes)
- [ ] Caché de resultados
- [ ] Dashboard de resumen
- [ ] Webhooks para notificaciones
- [ ] Autenticación API
- [ ] Paginación para tablas grandes

## 🐛 Troubleshooting

### "No se conecta a la base de datos"
- Verifica credenciales en `.env`
- Confirma que PostgreSQL esté corriendo
- Valida el nombre de la base de datos

### "Error al renderizar HTML"
- Verifica que la carpeta `templates/` exista
- Comprueba sintaxis del template EJS

### "Logo no aparece"
- Coloca imagen en `img/{company_id}.png`
- Verifica que sea PNG (otros formatos no funcionan)
- Comprueba permisos de lectura del archivo

## 📝 Licencia

ISC

## 👤 Autor

Proyecto generado por Copilot - 2026
