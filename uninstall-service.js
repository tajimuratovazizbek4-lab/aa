const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'H58C-Thermal-Print-Service',
  description: 'H-58C Thermal Printer Service - Automatic receipt printing for shift closures',
  script: path.join(__dirname, 'server.js')
});

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall', function(){
  console.log('✅ Thermal Print Service uninstalled successfully!');
  console.log('🔧 Service has been removed from Windows Services');
});

svc.on('stop', function(){
  console.log('🛑 Thermal Print Service stopped');
  console.log('🗑️  Uninstalling service...');
  svc.uninstall();
});

svc.on('error', function(err){
  console.error('❌ Service uninstallation error:', err);
});

console.log('🛑 Stopping and uninstalling Thermal Print Service...');
console.log('📋 Service Details:');
console.log(`   Name: ${svc.name}`);
console.log(`   Description: ${svc.description}`);
console.log('');

// Stop the service first, then uninstall
if (svc.exists) {
  console.log('🔍 Service found, stopping...');
  svc.stop();
} else {
  console.log('⚠️  Service not found, attempting uninstall anyway...');
  svc.uninstall();
}