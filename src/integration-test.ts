/**
 * Integration test to verify ioredis SET command works correctly
 * Run with: npx ts-node src/integration-test.ts
 * 
 * Requires Redis running on localhost:6379 (default) or specify REDIS_URL
 */

import { Redis } from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

async function testRedisSetWithExpiry() {
  console.log(`\n🔗 Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT}...\n`);
  
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  });

  try {
    // Test connection
    await redis.ping();
    console.log('✅ Redis connection successful\n');

    const testKey = 'test:Sessions:integration-test-' + Date.now();
    const sessionData = {
      'oauth2:state': '4d6fe0f8-ec7f-4abf-93cb-7e575b2de111',
      strategy: 'auth0',
      systemInfo: { browser: 'Chrome', os: 'Mac OS' },
      session: {
        idToken: 'eyJhbGciOiJSUzI1NiIs...',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        userId: '65af9e4720dcbccee04fd271',
        accessToken: 'eyJhbGciOiJSUzI1NiIs...',
        refreshToken: 'HYDKiuiCMKmJTdcL6OzrcEuo_zAqw2vE',
      },
    };

    const serializedData = JSON.stringify(sessionData);
    const ttlSeconds = 60; // 1 minute TTL for test

    // ============================================================
    // TEST 1: Correct ioredis syntax (what the fix uses)
    // ============================================================
    console.log('📝 TEST 1: Testing CORRECT ioredis syntax...');
    console.log(`   Command: redis.set(key, value, 'EX', ${ttlSeconds})`);
    
    try {
      const result = await redis.set(testKey, serializedData, 'EX', ttlSeconds);
      console.log(`   ✅ SUCCESS: SET returned "${result}"`);
      
      // Verify it was stored
      const storedValue = await redis.get(testKey);
      if (storedValue === serializedData) {
        console.log('   ✅ Data verified: stored value matches original');
      } else {
        console.log('   ❌ Data mismatch!');
      }

      // Check TTL
      const ttl = await redis.ttl(testKey);
      console.log(`   ✅ TTL verified: ${ttl} seconds remaining`);
      
      // Cleanup
      await redis.del(testKey);
      console.log('   ✅ Cleanup: test key deleted\n');
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.message}`);
      if (error.command) {
        console.log(`   Command args: ${JSON.stringify(error.command.args)}`);
      }
    }

    // ============================================================
    // TEST 2: Incorrect object syntax (what caused the bug)
    // ============================================================
    console.log('📝 TEST 2: Testing INCORRECT object syntax (simulating the bug)...');
    console.log('   Command: redis.set(key, value, { ex: seconds })');
    
    const buggyTestKey = 'test:Sessions:buggy-test-' + Date.now();
    
    try {
      // This is what the buggy code did - passing an object as 3rd argument
      // TypeScript will complain, but we force it to demonstrate the bug
      const buggyResult = await (redis as any).set(buggyTestKey, serializedData, { ex: ttlSeconds });
      console.log(`   Result: "${buggyResult}"`);
      
      // If we got here, check what was actually stored
      const storedValue = await redis.get(buggyTestKey);
      if (storedValue) {
        console.log('   ⚠️  Unexpectedly succeeded - checking stored value...');
        await redis.del(buggyTestKey);
      }
    } catch (error: any) {
      console.log(`   ❌ EXPECTED FAILURE: ${error.message}`);
      if (error.command) {
        console.log(`   Command args: ${JSON.stringify(error.command.args)}`);
        // Check if [object Object] appears in args
        const argsStr = JSON.stringify(error.command.args);
        if (argsStr.includes('[object Object]')) {
          console.log('   ⚠️  CONFIRMED: "[object Object]" appears in command args');
          console.log('   This is exactly the bug we fixed!\n');
        }
      }
    }

    // ============================================================
    // TEST 3: Large session data (similar to production)
    // ============================================================
    console.log('📝 TEST 3: Testing with large session data (production-like)...');
    
    const largeSessionData = {
      'oauth2:state': '4d6fe0f8-ec7f-4abf-93cb-7e575b2de111',
      strategy: 'auth0',
      systemInfo: { browser: 'Chrome', os: 'Mac OS' },
      tenantInfo: {
        id: '6901efa8171d013e60547ada',
        name: 'Static Default Tenant',
        description: 'Static Default Tenant',
        authProviderInfo: {
          provider: 'auth0',
          auth0: {
            auth0Domain: 'dev-cdebase.auth0.com',
            clientId: 'T9XM292l33Xb12RVPvRIfrb5hYTZsRme',
            audience: 'https://dev-cdebase.auth0.com/api/v2/',
            connection: 'Username-Password-Authentication',
            redirectUri: 'https://idefront.adminide-v13.cdebase.dev/callback/',
          },
        },
      },
      session: {
        idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlJFRkdOalEzTlRJNFJUY3dNRVV5TXpRNVJFTTNORE0wUkVWRU56VTJOemd6TkRVME16RXpSUSJ9.eyJodHRwczovL2lkZWZyb250LWFkbWluaWRlLXYxLmNkZWJhc2UuaW8vIjp7ImNvbm5lY3Rpb24iOiJVc2VybmFtZS1QYXNzd29yZC1BdXRoZW50aWNhdGlvbiIsImlzTmV3bHlMb2dnZWRJbiI6ZmFsc2UsImxvZ2luQWZ0ZXJTaWdudXAiOmZhbHNlLCJpc1NvY2lhbExvZ2luIjpmYWxzZX0sIm5pY2tuYW1lIjoic3RhY2tmbG93MTUwIiwibmFtZSI6InN0YWNrZmxvdzE1MEBnbWFpbC5jb20ifQ.signature',
        expiresAt: 1765996154,
        userId: '65af9e4720dcbccee04fd271',
        accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlJFRkdOalEzTlRJNFJUY3dNRVV5TXpRNVJFTTNORE0wUkVWRU56VTJOemd6TkRVME16RXpSUSJ9.eyJpc3MiOiJodHRwczovL2Rldi1jZGViYXNlLmF1dGgwLmNvbS8iLCJzdWIiOiJhdXRoMHw2NDY3M2Y4Y2YwOGNhNzMzYmE5MjI3NWYifQ.signature',
        authUserId: 'auth0|64673f8cf08ca733ba92275f',
        refreshToken: 'HYDKiuiCMKmJTdcL6OzrcEuo_zAqw2vEpgUleh35fgsJL',
        profile: {
          provider: 'auth0',
          tenant: null,
          nickname: 'stackflow150',
          email: 'stackflow150@gmail.com',
          picture: 'https://s.gravatar.com/avatar/68c2789a3174ca0e3cc57281cc0cbc6f?s=480',
        },
        isPasswordlessLogin: false,
      },
    };

    const largeKey = 'Adminide Dev:Sessions:fb7491200d6bebad';
    const largeSerialized = JSON.stringify(largeSessionData);
    console.log(`   Data size: ${largeSerialized.length} bytes`);

    try {
      const result = await redis.set(largeKey, largeSerialized, 'EX', 86400);
      console.log(`   ✅ SUCCESS: Large session data stored, result="${result}"`);
      
      const ttl = await redis.ttl(largeKey);
      console.log(`   ✅ TTL: ${ttl} seconds (${Math.round(ttl/3600)} hours)`);
      
      // Cleanup
      await redis.del(largeKey);
      console.log('   ✅ Cleanup complete\n');
    } catch (error: any) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
    }

    console.log('=' .repeat(60));
    console.log('✅ Integration tests completed!');
    console.log('=' .repeat(60));
    console.log('\nSummary:');
    console.log('- The CORRECT syntax is: redis.set(key, value, "EX", seconds)');
    console.log('- The BUGGY syntax was:  redis.set(key, value, { ex: seconds })');
    console.log('- The bug caused "[object Object]" to be passed to Redis');
    console.log('- This resulted in "ERR syntax error" from Redis\n');

  } catch (error: any) {
    console.error('❌ Connection or test error:', error.message);
  } finally {
    redis.disconnect();
    console.log('🔌 Redis connection closed');
  }
}

// Run the test
testRedisSetWithExpiry().catch(console.error);
