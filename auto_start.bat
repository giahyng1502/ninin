@echo off
echo ==========================================
echo    TU DONG CAI DAT VA CHAY NSOKISS SERVER
echo ==========================================

echo.
echo Kiem tra Docker...
docker -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Docker! Vui long cai dat Docker Desktop.
    pause
    exit /b
)

echo.
echo Dang build va khoi dong toan bo he thong (Database + Game Server)...
docker compose up --build -d

echo.
echo [THANH CONG] He thong dang duoc khoi dong ngam!
echo Ban co the kiem tra trang thai bang lenh: docker compose logs -f
pause
