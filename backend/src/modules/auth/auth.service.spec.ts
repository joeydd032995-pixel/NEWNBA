import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(() => {
    const prismaStub = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;

    jwtService = {
      sign: jest.fn((payload) => `jwt_token_${JSON.stringify(payload)}`),
      verify: jest.fn((token) => ({ sub: 'user-id' })),
    } as any;

    service = new AuthService(prismaStub, jwtService);
  });

  describe('hashPassword', () => {
    it('returns a hashed password', async () => {
      const result = await service.hashPassword('test123');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).not.toBe('test123');
    });

    it('hashes consistently', async () => {
      const hash1 = await service.hashPassword('password');
      const hash2 = await service.hashPassword('password');
      expect(hash1).not.toBe(hash2); // bcrypt should produce different hashes each time
    });
  });

  describe('comparePasswords', () => {
    it('returns true for matching passwords', async () => {
      const password = 'securePassword123';
      const hash = await service.hashPassword(password);
      const result = await service.comparePasswords(password, hash);
      expect(result).toBe(true);
    });

    it('returns false for non-matching passwords', async () => {
      const hash = await service.hashPassword('password1');
      const result = await service.comparePasswords('password2', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateTokens', () => {
    it('returns access and refresh tokens', () => {
      const result = service.generateTokens('user-123');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(jwtService.sign).toHaveBeenCalled();
    });

    it('includes user ID in token payload', () => {
      service.generateTokens('user-456');
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-456' }),
        expect.anything(),
      );
    });
  });
});
