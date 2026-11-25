@echo off
REM ============================================================
REM iniciar_proyecto.bat
REM Levanta todo el proyecto en local con doble clic:
REM   - el backend (padel-back) con "npm run dev" en http://localhost:3000
REM   - el frontend (padel-front) con "serve" en http://localhost:5500
REM   - y abre el navegador en el front.
REM Supone que padel-front esta en la carpeta hermana (..\padel-front)
REM y que MySQL de XAMPP ya esta iniciado.
REM ============================================================

REM Para que los acentos se vean bien en la consola
chcp 65001 >nul

echo Asegurate de tener MySQL iniciado en XAMPP
pause

REM %~dp0 es la carpeta donde esta este .bat (padel-back)
REM "start" abre una ventana nueva; /d indica en que carpeta arranca
start "Padel - Backend" /d "%~dp0" cmd /k npm run dev

REM Esperamos unos segundos a que arranque el backend.
REM Se usa la ruta completa de timeout.exe porque, si Git Bash esta en el PATH,
REM "timeout" podria ser otro programa con el mismo nombre.
"%SystemRoot%\System32\timeout.exe" /t 5 /nobreak >nul

REM serve es un servidor de archivos estaticos (npx lo descarga la primera vez).
REM Usa padel-front\serve.json, que desactiva las "clean URLs" para que las paginas
REM se sigan llamando reservar.html, admin.html, etc.
REM El puerto 5500 tiene que estar libre: cerra Live Server antes de usar este script.
start "Padel - Frontend" /d "%~dp0..\padel-front" cmd /k npx --yes serve -l 5500 .

"%SystemRoot%\System32\timeout.exe" /t 5 /nobreak >nul

REM Abre el navegador predeterminado directamente en el login (index.html)
start "" http://localhost:5500/index.html
