#!/bin/bash
# Bussines Radar — doble clic para abrir la app con datos en vivo.
cd "$(dirname "$0")"
echo "Abriendo Bussines Radar… (deja esta ventana abierta mientras lo uses; Ctrl+C para cerrar)"
exec python3 server.py
