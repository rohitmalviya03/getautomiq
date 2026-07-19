// PM2 process file for VPS/bare-metal deployment without Docker (e.g. a single
// box behind Cloudflare before you need full container orchestration).
// Usage: pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'growasy-api',
      script: 'dist/main.js',
      instances: 'max', // cluster mode across all CPU cores — API is stateless, safe to scale this way
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
