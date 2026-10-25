@echo off
echo ========================================================
echo 1. Sincronizando datos desde Google Sheets...
echo ========================================================
node update_from_sheets.js
if %ERRORLEVEL% NEQ 0 (
    echo Error al descargar datos de Google Sheets.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo 2. Subiendo cambios a GitHub...
echo ========================================================
git add .
git commit -m "update: sincronizacion automatica desde Google Sheets"
git push origin main

echo.
echo ========================================================
echo LISTO: Datos actualizados y subidos a GitHub con exito!
echo (Ya podes presionar F5 en tu navegador)
echo ========================================================
echo.
pause
