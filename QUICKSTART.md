# 🚀 GUÍA DE INICIO RÁPIDO

## 1️⃣  Instalación de Dependencias (5 minutos)

### Opción A: PowerShell (Windows)
```powershell
cd "C:\GRITSEE\District Report Drop Data"
npm install
```

### Opción B: CMD (Windows)
```cmd
cd C:\GRITSEE\District Report Drop Data
npm install
```

---

## 2️⃣  Configurar Base de Datos (5 minutos)

Edita el archivo `.env` con tus credenciales:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=tu_contraseña_aqui
DB_NAME=nombre_de_tu_base_datos
DB_SSL=false
PORT=3000
NODE_ENV=development
```

---

## 3️⃣  Validar Configuración (2 minutos)

```bash
node validate.js
```

Deberías ver algo como:
```
✅ Carpeta existe: src
✅ Archivo existe: package.json
✅ Conexión a PostgreSQL exitosa
...
✨ ¡SETUP COMPLETO Y LISTO PARA USAR!
```

---

## 4️⃣  Iniciar el Servidor (1 minuto)

### Opción A: Modo Normal
```bash
npm start
```

### Opción B: Modo Desarrollo (con auto-reload)
```bash
npm run dev
```

Deberías ver:
```
╔════════════════════════════════════════╗
║   Generador de Reportes - Activo      ║
║   Puerto: 3000                         ║
╚════════════════════════════════════════╝
```

---

## 5️⃣  Probar el Servidor (3 minutos)

### Test 1: Health Check
```bash
curl http://localhost:3000/api/health
```

Deberías obtener:
```json
{
  "status": "OK",
  "message": "Servidor de reportes activo"
}
```

### Test 2: Generar Reporte
```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d "{\"district_name\": \"D-11\", \"d1\": \"2026-04-13\", \"d2\": \"2026-04-19\"}" \
  > reporte.html
```

Luego abre `reporte.html` en tu navegador.

---

## 6️⃣  (Opcional) Agregar Logo de Empresa

Si tienes un logo PNG para la empresa (ej. ID 20):

1. Guarda la imagen como: `img/20.png`
2. Tamaño recomendado: 200x200px o 300x300px
3. Genera el reporte nuevamente
4. El logo aparecerá incrustado en el HTML

---

## ✅ Checklist de Verificación

- [ ] `npm install` completado sin errores
- [ ] `.env` configurado con credenciales correctas
- [ ] `node validate.js` muestra "✨ ¡SETUP COMPLETO!"
- [ ] Servidor inicia con `npm start`
- [ ] Health check responde (curl test 1)
- [ ] Reporte genera HTML (curl test 2)
- [ ] HTML se ve correctamente en navegador

---

## 📡 Próximos Pasos

**Usar Postman (UI Gráfica)**
- Descarga Postman: https://www.postman.com/downloads/
- Crea una nueva request POST a `http://localhost:3000/api/report`
- Body (JSON):
  ```json
  {
    "district_name": "D-11",
    "d1": "2026-04-13",
    "d2": "2026-04-19"
  }
  ```
- Click "Send" → ¡Recibirás el HTML en la pestaña "Preview"!

**Integrar en tu Aplicación Web**
- Desde tu frontend, haz un fetch/axios POST a tu servidor
- Recibe el HTML renderizado
- Muéstralo en un iframe o abre en nueva ventana

---

## 🆘 Problemas Comunes

**"Connection refused"**
- Verifica que PostgreSQL esté corriendo
- Comprueba el host/puerto en `.env`

**"node_modules not found"**
- Ejecuta: `npm install`

**"No data to show"**
- Verifica que `company_id`, `d1`, `d2` existan en tu BD
- Consulta directamente la BD:
  ```sql
  SELECT * FROM public.location WHERE company_id = 20;
  SELECT * FROM public.report WHERE company_id = 20;
  ```

**"EACCES permission denied"**
- En Linux/Mac: `chmod +x src/index.js`
- En Windows: generalmente no aplica

---

## 📞 Soporte

Consulta estos archivos para más detalles:
- `README.md` - Documentación completa
- `TESTING.md` - Guía de testing avanzado
- `src/config/constants.js` - Query SQL utilizado

---

**¡Listo para generar reportes! 🎉**
