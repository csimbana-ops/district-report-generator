# Testing API - Ejemplos de Uso

## Prerequisitos
- Servidor activo: `npm start` o `npm run dev`
- Base de datos configurada y corriendo
- Tabla `public.location`, `public.report`, `public.report_summary`, etc. creadas

## Testing con cURL

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

### 2. Generar Reporte (Básico)
```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d "{\"district_name\": \"D-11\", \"d1\": \"2026-04-13\", \"d2\": \"2026-04-19\"}"
```

### 3. Guardar Reporte en Archivo HTML
```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d "{\"district_name\": \"D-11\", \"d1\": \"2026-04-13\", \"d2\": \"2026-04-19\"}" \
  > report_20_2026-04-13_to_2026-04-19.html
```

Luego abre el HTML en tu navegador:
```bash
start report_20_2026-04-13_to_2026-04-19.html
```

## Testing con Postman

### Crear Nueva Request

1. **Haz clic en "+ New"**
2. **Selecciona "HTTP"**
3. **Completa los datos:**

   - **Método**: `POST`
   - **URL**: `http://localhost:3000/api/report`

4. **Vaya a la pestaña "Body"**
5. **Selecciona "raw"** y elige **"JSON"** del dropdown
6. **Pega este JSON:**
   ```json
  {
    "district_name": "D-11",
    "d1": "2026-04-13",
    "d2": "2026-04-19"
  }
   ```

7. **Haz clic en "Send"**
8. **En "Response" busca "Preview"** para ver el HTML renderizado

## Casos de Prueba

### ✅ Caso 1: Reporte Válido
```json
{
  "district_name": "D-11",
  "d1": "2026-04-13",
  "d2": "2026-04-19"
}
```
**Esperado**: 200 OK + HTML con datos

### ✅ Caso 2: Parámetros Faltantes
```json
{
  "district_name": "D-11"
}
```
**Esperado**: 400 Error "Parámetros faltantes"

### ✅ Caso 3: Company ID Inválido
```json
{
  "company_id": "abc",
  "district_name": "D-11",
  "d1": "2026-04-13",
  "d2": "2026-04-19"
}
```
**Esperado**: 400 Error "company_id debe ser un número"

### ✅ Caso 4: Fechas Inválidas
```json
{
  "district_name": "D-11",
  "d1": "2026-13-01",
  "d2": "no-es-fecha"
}
```
**Esperado**: 400 Error "Fechas inválidas"

### ✅ Caso 5: Sin Datos en BD (Válido pero vacío)
```json
{
  "district_name": "D-99",
  "d1": "2026-04-13",
  "d2": "2026-04-19"
}
```
**Esperado**: 200 OK + HTML con "No hay datos"

## Validación Visual

Al abrir el HTML en navegador, verifica:

1. ✓ **Encabezado**
   - [ ] Logo se ve (si existe en `img/LogoLittle.png`)
   - [ ] Título "Reporte de Distrito"

2. ✓ **Métricas**
   - [ ] 6 tarjetas coloridas
   - [ ] Total de tiendas > 0
   - [ ] Niveles suman correctamente

3. ✓ **Tabla**
   - [ ] Encabezados visibles
   - [ ] Filas con datos de tiendas
   - [ ] Links "Ver Informe" clickeables
   - [ ] Puntuaciones con badges de color

4. ✓ **Footer**
   - [ ] Si hay tiendas fuera de línea: muestra lista
   - [ ] Si no las hay: muestra "✓ Todas las tiendas..."

## Depuración

### Ver logs del servidor
```bash
npm run dev
```
El log mostrará:
```
POST /api/report 200 - 15ms
```

### Verificar conexión a BD
Edita temporalmente `src/index.js` y agrega:
```javascript
app.get('/debug/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0] });
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});
```

Luego prueba:
```bash
curl http://localhost:3000/debug/db
```

## Notas

- Los reportes se pueden guardar directamente desde el navegador (Ctrl+S o Print → Guardar como PDF)
- Los links de "Ver Informe" apuntan a S3 y solo funcionan si el `report_mid` es válido
- Si no hay logo, muestra un placeholder gris

---

**¿Problemas?** Consulta el README.md o revisa los logs del servidor con `npm run dev`
