const Service = require('node-windows').Service;
const path = require('path');

console.log('🖨️ Installing H-58C Thermal Print Service for Windows...');
console.log('📋 This will install the service to run automatically on Windows startup');
console.log('');

// Create a new service object
const svc = new Service({
  name: 'H58C-Thermal-Print-Service',
  description: 'H-58C Thermal Printer Service - Automatic receipt printing for shift closures',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: "NODE_ENV",
      value: "production"
    },
    {
      name: "PORT", 
      value: "3001"
    }
  ]
});

// Listen for the "install" event, which indicates the process is available as a service.
svc.on('install', function(){
  console.log('✅ Thermal Print Service installed successfully!');
  console.log('🚀 Starting service...');
  
  // Wait a moment before starting
  setTimeout(() => {
    svc.start();
  }, 2000);
});

svc.on('start', function(){
  console.log('✅ H-58C Thermal Print Service started successfully!');
  console.log('📡 Service is now running on http://localhost:3001');
  console.log('🔧 You can manage the service through:');
  console.log('   - Windows Services (services.msc)');
  console.log('   - Look for "H58C-Thermal-Print-Service"');
  console.log('');
  console.log('🖨️ Make sure your H-58C printer is connected via USB');
  console.log('🌐 Your web application will now automatically print receipts!');
  
  // Exit after successful start
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

svc.on('error', function(err){
  console.error('❌ Service installation error:', err);
  console.error('🔧 Try running as Administrator or check the logs in daemon folder');
});

// Handle if service already exists
svc.on('alreadyinstalled', function(){
  console.log('⚠️  Service already installed. Starting existing service...');
  svc.start();
});

console.log('🔧 Installing Thermal Print Service as Windows Service...');
console.log('📋 Service Details:');
console.log(`   Name: ${svc.name}`);
console.log(`   Description: ${svc.description}`);
console.log(`   Script: ${svc.script}`);
console.log(`   Port: 3001`);
console.log('');

// Install the service
svc.install();