#!/bin/bash
echo "=========================================="
echo "   TU DONG CAI DAT VA CHAY NSOKISS SERVER "
echo "=========================================="

echo ""
echo "Kiem tra Docker..."
if ! command -v docker &> /dev/null; then
    echo "[LOI] Khong tim thay Docker! Vui long cai dat Docker tren Ubuntu bang lenh: sudo apt install docker.io docker-compose-v2"
    exit 1
fi

echo ""
echo "Dang build va khoi dong toan bo he thong (Database + Game Server + Web SSL)..."
# Kiem tra version cua docker compose (co the la plugin v2 hoac ban v1 cu)
if docker compose version &> /dev/null; then
    docker compose up --build -d
else
    docker-compose up --build -d
fi

echo ""
echo "[THANH CONG] He thong dang duoc khoi dong ngam!"
echo "Ban co the kiem tra trang thai bang lenh: docker compose logs -f"
