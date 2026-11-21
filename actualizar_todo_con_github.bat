@echo off
echo ========================================================
echo 1. Sincronizando datos de la plataforma anterior (Google Sheets)...
echo ========================================================
node update_from_sheets.js
if %ERRORLEVEL% NEQ 0 (
    echo Error al descargar datos de Google Sheets.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo 2. Subiendo a GitHub solo los archivos de datos...
echo ========================================================
git add datos_precargados.js seguimiento/datos.js
git diff --cached --quiet
if %ERRORLEVEL% EQU 0 (
    echo No hay cambios para subir.
    pause
    exit /b 0
)
git commit -m "update: sincronizacion de datos desde Google Sheets"
if %ERRORLEVEL% NEQ 0 (
    echo Error al crear el commit.
    pause
    exit /b 1
)
git push origin main

echo.
echo ========================================================
echo LISTO. (Ya podes presionar F5 en tu navegador)
echo Nota: los datos del modulo Seguimiento se regeneran con
echo   python seguimiento\build_data.py --detalle ... --emergentes ...
echo ========================================================
echo.
pause