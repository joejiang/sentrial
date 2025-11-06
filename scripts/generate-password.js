#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔐 Password Hash Generator');
console.log('==========================\n');

rl.question('Enter username: ', (username) => {
  rl.question('Enter password: ', (password) => {
    const hash = bcrypt.hashSync(password, 10);
    
    console.log('\n✅ Generated credentials:');
    console.log('========================');
    console.log(`USER_CREDENTIALS=${username}:${hash}`);
    console.log('\n📋 Copy the above line to your .env file or docker-compose.yml');
    
    rl.close();
  });
});