@echo off
echo ========================================================
echo Sincronizando datos desde Google Sheets a la plataforma
echo ========================================================
node update_from_sheets.js
echo.
echo Presiona cualquier tecla para salir...
pause >nul
