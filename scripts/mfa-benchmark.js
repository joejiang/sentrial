#!/usr/bin/env node

// MFA Performance and Logic Benchmark Script

const speakeasy = require('speakeasy');

function runBenchmark() {
  console.log('🚀 MFA Logic Benchmark');
  console.log('======================\n');

  // Test parameters
  const testSecret = 'JBSWY3DPEHPK3PXP'; // Base32 test secret
  const testCases = 1000;
  const timeWindows = [-2, -1, 0, 1, 2]; // Test different time windows

  console.log('📊 Test Configuration:');
  console.log(`   Secret: ${testSecret}`);
  console.log(`   Test cases: ${testCases}`);
  console.log(`   Step duration: 30 seconds`);
  console.log(`   Window tolerance: ±2 steps (±1 minute)\n`);

  // Benchmark token generation
  console.log('⚡ Token Generation Benchmark:');
  console.log('=============================');
  
  const genStart = process.hrtime.bigint();
  const tokens = [];
  
  for (let i = 0; i < testCases; i++) {
    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      step: 30,
      time: Math.floor(Date.now() / 1000)
    });
    tokens.push(token);
  }
  
  const genEnd = process.hrtime.bigint();
  const genTime = Number(genEnd - genStart) / 1000000; // Convert to milliseconds
  
  console.log(`✅ Generated ${testCases} tokens in ${genTime.toFixed(2)}ms`);
  console.log(`   Average: ${(genTime / testCases).toFixed(4)}ms per token\n`);

  // Benchmark token verification
  console.log('🔍 Token Verification Benchmark:');
  console.log('================================');
  
  const verifyStart = process.hrtime.bigint();
  let validTokens = 0;
  
  for (let i = 0; i < testCases; i++) {
    const isValid = speakeasy.totp.verify({
      secret: testSecret,
      encoding: 'base32',
      token: tokens[i],
      window: 2,
      step: 30,
      time: Math.floor(Date.now() / 1000)
    });
    if (isValid) validTokens++;
  }
  
  const verifyEnd = process.hrtime.bigint();
  const verifyTime = Number(verifyEnd - verifyStart) / 1000000;
  
  console.log(`✅ Verified ${testCases} tokens in ${verifyTime.toFixed(2)}ms`);
  console.log(`   Average: ${(verifyTime / testCases).toFixed(4)}ms per verification`);
  console.log(`   Valid tokens: ${validTokens}/${testCases} (${(validTokens/testCases*100).toFixed(1)}%)\n`);

  // Test time window tolerance
  console.log('⏰ Time Window Tolerance Test:');
  console.log('==============================');
  
  const baseTime = Math.floor(Date.now() / 1000);
  const baseToken = speakeasy.totp({
    secret: testSecret,
    encoding: 'base32',
    step: 30,
    time: baseTime
  });
  
  console.log(`Base time: ${new Date(baseTime * 1000).toISOString()}`);
  console.log(`Base token: ${baseToken}\n`);
  
  timeWindows.forEach(window => {
    const testTime = baseTime + (window * 30); // Offset by window * step
    const testToken = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      step: 30,
      time: testTime
    });
    
    const isValid = speakeasy.totp.verify({
      secret: testSecret,
      encoding: 'base32',
      token: testToken,
      window: 2,
      step: 30,
      time: baseTime
    });
    
    const timeOffset = window * 30;
    const timeOffsetSec = Math.abs(timeOffset);
    
    console.log(`Window ${window.toString().padStart(2)}: ${testToken} (${timeOffset >= 0 ? '+' : ''}${timeOffset}s) → ${isValid ? '✅ VALID' : '❌ INVALID'}`);
  });

  console.log('\n🧪 Edge Case Tests:');
  console.log('==================');
  
  // Test invalid tokens
  const invalidTokens = ['000000', '123456', '999999', 'abcdef', '12345', '1234567'];
  invalidTokens.forEach(token => {
    const isValid = speakeasy.totp.verify({
      secret: testSecret,
      encoding: 'base32',
      token: token,
      window: 2,
      step: 30,
      time: baseTime
    });
    console.log(`Invalid token "${token}": ${isValid ? '⚠️  UNEXPECTEDLY VALID' : '✅ CORRECTLY REJECTED'}`);
  });

  // Test token cleaning
  console.log('\n🧹 Token Cleaning Test:');
  console.log('=======================');
  
  const dirtyTokens = [
    ` ${baseToken} `,
    `${baseToken.slice(0,3)} ${baseToken.slice(3)}`,
    `${baseToken}-extra-chars`,
    `abc${baseToken}def`
  ];
  
  dirtyTokens.forEach(dirtyToken => {
    const cleanToken = dirtyToken.replace(/\D/g, '');
    const isValid = speakeasy.totp.verify({
      secret: testSecret,
      encoding: 'base32',
      token: cleanToken,
      window: 2,
      step: 30,
      time: baseTime
    });
    console.log(`"${dirtyToken}" → "${cleanToken}" → ${isValid ? '✅ VALID' : '❌ INVALID'}`);
  });

  console.log('\n📈 Performance Summary:');
  console.log('======================');
  console.log(`Token generation: ${(genTime / testCases).toFixed(4)}ms avg`);
  console.log(`Token verification: ${(verifyTime / testCases).toFixed(4)}ms avg`);
  console.log(`Total time: ${(genTime + verifyTime).toFixed(2)}ms`);
  console.log(`Throughput: ${(testCases * 2 / (genTime + verifyTime) * 1000).toFixed(0)} operations/second`);
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark };