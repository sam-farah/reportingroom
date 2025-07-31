import CryptoJS from 'crypto-js';
import forge from 'node-forge';

// Encryption configuration for medical data compliance
export class MedicalDataEncryption {
  private static readonly ALGORITHM = 'AES-256-CBC';
  private static readonly KEY_SIZE = 256;
  private static readonly IV_SIZE = 16;
  
  // Get encryption key from environment or use development fallback
  private static getEncryptionKey(): string {
    if (!process.env.MEDICAL_DATA_ENCRYPTION_KEY) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️  Using development fallback encryption - NOT for production use');
        return 'dev_fallback_key_32_chars_minimum!!'; // 32+ char fallback for dev
      }
      throw new Error(
        'MEDICAL_DATA_ENCRYPTION_KEY environment variable is required for regulatory compliance. ' +
        'Generate a secure 256-bit key and set this environment variable.'
      );
    }
    return process.env.MEDICAL_DATA_ENCRYPTION_KEY;
  }

  // Encrypt sensitive medical data (patient info, findings, etc.)
  static encryptMedicalData(plaintext: string): string {
    try {
      const key = this.getEncryptionKey();
      if (process.env.NODE_ENV === 'development' && !process.env.MEDICAL_DATA_ENCRYPTION_KEY) {
        // In development without proper keys, return plaintext with warning prefix
        return `DEV_UNENCRYPTED:${plaintext}`;
      }
      
      // Use default AES encryption (most compatible)
      const encrypted = CryptoJS.AES.encrypt(plaintext, key);
      
      return encrypted.toString();
    } catch (error) {
      console.error('Medical data encryption failed:', error);
      if (process.env.NODE_ENV === 'development') {
        console.warn('Development mode: returning unencrypted data');
        return `DEV_UNENCRYPTED:${plaintext}`;
      }
      throw new Error('Failed to encrypt medical data for regulatory compliance');
    }
  }

  // Decrypt sensitive medical data
  static decryptMedicalData(ciphertext: string): string {
    try {
      // Handle development unencrypted data
      if (ciphertext.startsWith('DEV_UNENCRYPTED:')) {
        return ciphertext.replace('DEV_UNENCRYPTED:', '');
      }
      
      const key = this.getEncryptionKey();
      const decrypted = CryptoJS.AES.decrypt(ciphertext, key);
      
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Medical data decryption failed:', error);
      if (process.env.NODE_ENV === 'development') {
        console.warn('Development mode: returning potentially unencrypted data');
        return ciphertext;
      }
      throw new Error('Failed to decrypt medical data');
    }
  }

  // Encrypt files (worksheets, signatures, logos)
  static encryptFile(buffer: Buffer): { encryptedData: Buffer; metadata: string } {
    try {
      const key = this.getEncryptionKey();
      
      // Generate random IV for each file
      const iv = forge.random.getBytesSync(this.IV_SIZE);
      const cipher = forge.cipher.createCipher('AES-GCM', key);
      
      cipher.start({ iv });
      cipher.update(forge.util.createBuffer(buffer));
      cipher.finish();
      
      const encryptedData = Buffer.from(cipher.output.getBytes(), 'binary');
      const tag = cipher.mode.tag.getBytes();
      
      // Store IV and authentication tag as metadata
      const metadata = JSON.stringify({
        iv: forge.util.encode64(iv),
        tag: forge.util.encode64(tag),
        algorithm: this.ALGORITHM
      });
      
      return { encryptedData, metadata };
    } catch (error) {
      console.error('File encryption failed:', error);
      throw new Error('Failed to encrypt file for regulatory compliance');
    }
  }

  // Decrypt files
  static decryptFile(encryptedData: Buffer, metadata: string): Buffer {
    try {
      const key = this.getEncryptionKey();
      const meta = JSON.parse(metadata);
      
      const iv = forge.util.decode64(meta.iv);
      const tag = forge.util.decode64(meta.tag);
      
      const decipher = forge.cipher.createDecipher('AES-GCM', key);
      decipher.start({ iv, tag });
      decipher.update(forge.util.createBuffer(encryptedData.toString('binary')));
      
      if (!decipher.finish()) {
        throw new Error('File decryption authentication failed');
      }
      
      return Buffer.from(decipher.output.getBytes(), 'binary');
    } catch (error) {
      console.error('File decryption failed:', error);
      throw new Error('Failed to decrypt file');
    }
  }

  // Hash sensitive data for database lookups (one-way)
  static hashSensitiveData(data: string): string {
    const salt = process.env.MEDICAL_DATA_SALT || 'default-salt-change-in-production';
    return CryptoJS.SHA256(data + salt).toString();
  }

  // Generate secure random token for invitations, sessions, etc.
  static generateSecureToken(length: number = 32): string {
    return forge.random.getBytesSync(length);
  }

  // Validate encryption key strength
  static validateEncryptionSetup(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!process.env.MEDICAL_DATA_ENCRYPTION_KEY) {
      issues.push('MEDICAL_DATA_ENCRYPTION_KEY environment variable not set');
    } else if (process.env.MEDICAL_DATA_ENCRYPTION_KEY.length < 32) {
      issues.push('Encryption key must be at least 256 bits (32 characters)');
    }
    
    if (!process.env.MEDICAL_DATA_SALT) {
      issues.push('MEDICAL_DATA_SALT environment variable not set');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// Middleware to encrypt/decrypt HTTP request/response data
export const encryptionMiddleware = {
  // Encrypt outgoing response data
  encryptResponse: (data: any): string => {
    const jsonString = JSON.stringify(data);
    return MedicalDataEncryption.encryptMedicalData(jsonString);
  },

  // Decrypt incoming request data
  decryptRequest: (encryptedData: string): any => {
    const decryptedString = MedicalDataEncryption.decryptMedicalData(encryptedData);
    return JSON.parse(decryptedString);
  }
};

// Field-level encryption for specific sensitive fields
export const FieldEncryption = {
  // Fields that require encryption for regulatory compliance
  ENCRYPTED_FIELDS: [
    'patientName',
    'patientDob', 
    'findings',
    'impression',
    'indication',
    'address',
    'phone',
    'email'
  ],

  // Encrypt specific fields in an object
  encryptFields(obj: Record<string, any>): Record<string, any> {
    const encrypted = { ...obj };
    
    this.ENCRYPTED_FIELDS.forEach(field => {
      if (encrypted[field] && typeof encrypted[field] === 'string') {
        encrypted[field] = MedicalDataEncryption.encryptMedicalData(encrypted[field]);
        encrypted[`${field}_encrypted`] = true;
      }
    });
    
    return encrypted;
  },

  // Decrypt specific fields in an object
  decryptFields(obj: Record<string, any>): Record<string, any> {
    const decrypted = { ...obj };
    
    this.ENCRYPTED_FIELDS.forEach(field => {
      if (decrypted[field] && decrypted[`${field}_encrypted`]) {
        try {
          decrypted[field] = MedicalDataEncryption.decryptMedicalData(decrypted[field]);
          delete decrypted[`${field}_encrypted`];
        } catch (error) {
          console.error(`Failed to decrypt field ${field}:`, error);
        }
      }
    });
    
    return decrypted;
  }
};