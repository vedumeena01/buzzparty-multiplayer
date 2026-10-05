import { startTunnel } from 'untun';

async function main() {
  console.log('🚀 Starting Cloudflare Quick Tunnel on port 3000...');
  try {
    const tunnel = await startTunnel({
      port: 3000,
      hostname: 'localhost',
      protocol: 'http'
    });
    const url = await tunnel.getURL();
    console.log(`===============================================`);
    console.log(`🎉 LIVE PUBLIC GAME URL: ${url}`);
    console.log(`📱 MOBILE PLAYER CONTROLLER: ${url}/player.html`);
    console.log(`===============================================`);
  } catch (err) {
    console.error('Tunnel error:', err);
  }
}

main();
