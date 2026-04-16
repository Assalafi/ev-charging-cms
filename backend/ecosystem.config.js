module.exports = {
  apps: [{
    name: "ev-charging-backend",
    script: "src/index.js",
    cwd: "/var/www/evcharging/backend",
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 5000,
      WS_PORT: 8081,  // Using alternative port
      OCPP_SUPPORTED_VERSIONS: "ocpp1.6"
    },
    error_file: "logs/err.log",
    out_file: "logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
}
