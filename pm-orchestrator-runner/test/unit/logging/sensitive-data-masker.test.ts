/**
 * Sensitive Data Masker Tests
 *
 * TDD Tests for spec 06_CORRECTNESS_PROPERTIES.md Property 24/25
 * and spec 13_LOGGING_AND_OBSERVABILITY.md Section 4
 *
 * Tests 11 masking patterns across 4 priority levels
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';

import {
  maskSensitiveData,
  containsSensitiveData,
  maskSensitiveObject,
  getApiKeyStatus,
  MASKING_PATTERNS,
} from '../../../src/logging/sensitive-data-masker';

describe('Sensitive Data Masker - 11 Masking Patterns', () => {
  /**
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25 Section 3:
   * Priority 1 patterns - API Keys and Private Keys
   */
  describe('Priority 1 - Critical Secrets', () => {
    it('should mask OpenAI API Key', () => {
      const input = 'My API key is sk-1234567890abcdefghij1234567890abcdefghij';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('sk-1234'), 'Should not contain API key');
      assert.ok(masked.includes('[MASKED:OPENAI_KEY]'), 'Should show masked marker');
    });

    it('should mask Anthropic API Key', () => {
      const input = 'Using sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('sk-ant-api03'), 'Should not contain API key');
      assert.ok(masked.includes('[MASKED:ANTHROPIC_KEY]'), 'Should show masked marker');
    });

    it('should mask Private Key blocks', () => {
      const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA2Z3qX2BTLS4e0R\n-----END RSA PRIVATE KEY-----';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('BEGIN RSA PRIVATE KEY'), 'Should not contain private key');
      assert.ok(masked.includes('[MASKED:PRIVATE_KEY]'), 'Should show masked marker');
    });

    it('should mask EC Private Key blocks', () => {
      const input = '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBDiU2\n-----END EC PRIVATE KEY-----';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('BEGIN EC PRIVATE KEY'), 'Should not contain private key');
      assert.ok(masked.includes('[MASKED:PRIVATE_KEY]'), 'Should show masked marker');
    });
  });

  /**
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25 Section 3:
   * Priority 2 patterns - Tokens and Auth Headers
   */
  describe('Priority 2 - Tokens and Auth Headers', () => {
    it('should mask JWT tokens', () => {
      // JWT without Bearer prefix
      const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('eyJhbGciOiJ'), 'Should not contain JWT');
      // JWT could be masked by JWT pattern or Bearer pattern
      assert.ok(masked.includes('[MASKED:'), 'Should have some masked marker');
    });

    it('should mask Authorization headers', () => {
      const input = 'Authorization: Basic dXNlcjpwYXNzd29yZA==';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('Basic dXNlcjpwYXNz'), 'Should not contain auth header');
      assert.ok(masked.includes('[MASKED:AUTH_HEADER]'), 'Should show masked marker');
    });

    it('should mask Cookie headers', () => {
      const input = 'Cookie: session_id=abc123def456; user_token=xyz789';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('session_id=abc123'), 'Should not contain cookie');
      assert.ok(masked.includes('[MASKED:COOKIE]'), 'Should show masked marker');
    });

    it('should mask Set-Cookie headers', () => {
      const input = 'Set-Cookie: auth_token=secret123; Path=/; HttpOnly';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('auth_token=secret123'), 'Should not contain set-cookie');
      assert.ok(masked.includes('[MASKED:SET_COOKIE]'), 'Should show masked marker');
    });
  });

  /**
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25 Section 3:
   * Priority 3 patterns - Credentials in JSON and Env
   */
  describe('Priority 3 - Credentials', () => {
    it('should mask JSON credentials', () => {
      const input = '{"apiKey": "sk-secret-key-12345", "password": "supersecret"}';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('sk-secret-key'), 'Should not contain API key in JSON');
      assert.ok(!masked.includes('supersecret'), 'Should not contain password in JSON');
      // Could be masked by JSON_CREDENTIAL or GENERIC_SECRET
      assert.ok(masked.includes('[MASKED:'), 'Should have masked marker');
    });

    it('should mask Environment credentials', () => {
      const input = 'DATABASE_PASSWORD=mydbpassword123';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('mydbpassword123'), 'Should not contain env password');
      assert.ok(masked.includes('[MASKED:ENV_CREDENTIAL]'), 'Should show masked marker');
    });

    it('should mask Bearer tokens', () => {
      const input = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.something.here';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('eyJhbGciOiJSUzI1NiI'), 'Should not contain bearer token');
      assert.ok(masked.includes('[MASKED:'), 'Should have masked marker');
    });
  });

  /**
   * Per spec 06_CORRECTNESS_PROPERTIES.md Property 25 Section 3:
   * Priority 4 patterns - Generic Secrets
   */
  describe('Priority 4 - Generic Secrets', () => {
    it('should mask generic secret patterns', () => {
      const input = 'secret_key = my-super-secret-value';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('my-super-secret-value'), 'Should not contain secret');
      assert.ok(masked.includes('[MASKED:'), 'Should have some masked marker');
    });

    it('should mask password patterns', () => {
      const input = 'password: hunter2';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('hunter2'), 'Should not contain password');
    });

    it('should mask token patterns', () => {
      const input = 'token=abc123xyz789';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('abc123xyz789'), 'Should not contain token');
    });
  });

  describe('Pattern Count Verification', () => {
    /**
     * Per spec: Must have 11 patterns
     */
    it('should have at least 11 masking patterns', () => {
      assert.ok(MASKING_PATTERNS.length >= 11, 
        'Should have at least 11 patterns, got ' + MASKING_PATTERNS.length);
    });

    it('should have patterns for all priority levels', () => {
      const patternNames = MASKING_PATTERNS.map(p => p.name.toLowerCase());
      
      // Priority 1
      assert.ok(patternNames.some(n => n.includes('openai')), 'Should have OpenAI pattern');
      assert.ok(patternNames.some(n => n.includes('anthropic')), 'Should have Anthropic pattern');
      assert.ok(patternNames.some(n => n.includes('private') && n.includes('key')), 'Should have Private Key pattern');
      
      // Priority 2
      assert.ok(patternNames.some(n => n.includes('jwt')), 'Should have JWT pattern');
      assert.ok(patternNames.some(n => n.includes('auth')), 'Should have Authorization pattern');
      assert.ok(patternNames.some(n => n.includes('cookie')), 'Should have Cookie pattern');
      
      // Priority 3
      assert.ok(patternNames.some(n => n.includes('bearer')), 'Should have Bearer pattern');
      
      // Priority 4
      assert.ok(patternNames.some(n => n.includes('secret') || n.includes('generic')), 'Should have Generic Secret pattern');
    });
  });

  describe('Detection Function', () => {
    it('should detect OpenAI keys', () => {
      const input = 'Key: sk-1234567890abcdefghij1234567890';
      assert.ok(containsSensitiveData(input), 'Should detect OpenAI key');
    });

    it('should detect JWT tokens', () => {
      const input = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456';
      assert.ok(containsSensitiveData(input), 'Should detect JWT');
    });

    it('should detect private keys', () => {
      // Full private key block format
      const input = '-----BEGIN PRIVATE KEY-----\nMIIEvg...\n-----END PRIVATE KEY-----';
      assert.ok(containsSensitiveData(input), 'Should detect private key');
    });

    it('should not detect normal text', () => {
      const input = 'This is just a normal log message with no secrets';
      assert.ok(!containsSensitiveData(input), 'Should not detect normal text');
    });
  });

  describe('Object Masking', () => {
    it('should mask nested objects', () => {
      const input = {
        config: {
          apiKey: 'sk-1234567890abcdefghij1234567890',
          nested: {
            token: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ.sig'
          }
        }
      };
      
      const masked = maskSensitiveObject(input);
      
      assert.ok(!JSON.stringify(masked).includes('sk-1234'), 'Should not contain API key');
      assert.ok(!JSON.stringify(masked).includes('eyJhbGciOiJ'), 'Should not contain JWT');
    });

    it('should mask arrays with sensitive data', () => {
      const input = [
        'sk-1234567890abcdefghij1234567890abcd',
        'normal text',
        { key: 'Bearer abc123.def456.ghi789' }
      ];
      
      const masked = maskSensitiveObject(input);
      
      assert.ok(!JSON.stringify(masked).includes('sk-1234'), 'Should not contain API key');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null input', () => {
      assert.equal(maskSensitiveData(null as unknown as string), null);
    });

    it('should handle undefined input', () => {
      assert.equal(maskSensitiveData(undefined as unknown as string), undefined);
    });

    it('should handle empty string', () => {
      assert.equal(maskSensitiveData(''), '');
    });

    it('should handle multiple secrets in one string', () => {
      const input = 'Key1: sk-1234567890abcdefghij, Key2: sk-ant-api03-abcdefghijklmnopqrst';
      const masked = maskSensitiveData(input);
      
      assert.ok(!masked.includes('sk-1234'), 'Should not contain first key');
      assert.ok(!masked.includes('sk-ant-api03'), 'Should not contain second key');
    });
  });
});

describe('API Key Status - Property 24', () => {
  it('should return NOT SET for missing env var', () => {
    const originalValue = process.env.TEST_API_KEY;
    delete process.env.TEST_API_KEY;
    
    const status = getApiKeyStatus('TEST_API_KEY');
    assert.equal(status, 'NOT SET');
    
    if (originalValue !== undefined) {
      process.env.TEST_API_KEY = originalValue;
    }
  });

  it('should return SET for existing env var', () => {
    const originalValue = process.env.TEST_API_KEY_SET;
    process.env.TEST_API_KEY_SET = 'some-value';
    
    const status = getApiKeyStatus('TEST_API_KEY_SET');
    assert.equal(status, 'SET');
    
    if (originalValue !== undefined) {
      process.env.TEST_API_KEY_SET = originalValue;
    } else {
      delete process.env.TEST_API_KEY_SET;
    }
  });

  it('should return NOT SET for empty string', () => {
    const originalValue = process.env.TEST_API_KEY_EMPTY;
    process.env.TEST_API_KEY_EMPTY = '';
    
    const status = getApiKeyStatus('TEST_API_KEY_EMPTY');
    assert.equal(status, 'NOT SET');
    
    if (originalValue !== undefined) {
      process.env.TEST_API_KEY_EMPTY = originalValue;
    } else {
      delete process.env.TEST_API_KEY_EMPTY;
    }
  });
});
