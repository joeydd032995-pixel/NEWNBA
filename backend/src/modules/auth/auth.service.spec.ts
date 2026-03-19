import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Mock bcrypt module to avoid slow real hashing
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-value'),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prismaStub: any;
  let jwtStub: any;
  let configStub: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    isActive: true,
    planType: 'FREE',
    refreshToken: 'hashed-refresh',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prismaStub = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtStub = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verify: jest.fn().mockReturnValue({ sub: 'user-1', email: 'test@example.com' }),
    };

    configStub = {
      get: jest.fn((key: string, defaultVal?: any) => {
        const cfg: Record<string, string> = {
          JWT_SECRET: 'test-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
          JWT_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return cfg[key] ?? defaultVal;
      }),
    };

    service = new AuthService(prismaStub, jwtStub, configStub);
  });

  describe('validateUser', () => {
    it('returns sanitized user when credentials are valid', async () => {
      prismaStub.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeDefined();
      expect(result!.email).toBe('test@example.com');
      expect((result as any).password).toBeUndefined();
    });

    it('returns null when user not found', async () => {
      prismaStub.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('notfound@example.com', 'password');

      expect(result).toBeNull();
    });

    it('returns null when password does not match', async () => {
      prismaStub.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('test@example.com', 'wrong-password');

      expect(result).toBeNull();
    });

    it('returns null when user is inactive', async () => {
      prismaStub.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('signup', () => {
    it('throws ConflictException if email already exists', async () => {
      prismaStub.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.signup({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates user, hashes password, and returns tokens', async () => {
      prismaStub.user.findUnique.mockResolvedValue(null);
      prismaStub.user.create.mockResolvedValue(mockUser);
      prismaStub.user.update.mockResolvedValue(mockUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.signup({ email: 'new@example.com', password: 'password' });

      expect(bcrypt.hash).toHaveBeenCalledWith('password', 12);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
    });

    it('sanitizes user — omits password and refreshToken from response', async () => {
      prismaStub.user.findUnique.mockResolvedValue(null);
      prismaStub.user.create.mockResolvedValue(mockUser);
      prismaStub.user.update.mockResolvedValue(mockUser);

      const result = await service.signup({ email: 'new@example.com', password: 'password' });

      expect((result.user as any).password).toBeUndefined();
      expect((result.user as any).refreshToken).toBeUndefined();
    });
  });

  describe('logout', () => {
    it('clears refreshToken field for user', async () => {
      prismaStub.user.update.mockResolvedValue({ ...mockUser, refreshToken: null });

      const result = await service.logout('user-1');

      expect(prismaStub.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
      expect(result.message).toContain('Logged out');
    });
  });

  describe('getProfile', () => {
    it('returns sanitized user profile', async () => {
      prismaStub.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-1');

      expect(result.email).toBe('test@example.com');
      expect((result as any).password).toBeUndefined();
      expect((result as any).refreshToken).toBeUndefined();
    });

    it('throws NotFoundException when user not found', async () => {
      prismaStub.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateTokens (via signup)', () => {
    it('includes userId in JWT payload', async () => {
      prismaStub.user.findUnique.mockResolvedValue(null);
      prismaStub.user.create.mockResolvedValue(mockUser);
      prismaStub.user.update.mockResolvedValue(mockUser);

      await service.signup({ email: 'new@example.com', password: 'password' });

      expect(jwtStub.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: mockUser.id, email: mockUser.email }),
        expect.objectContaining({ secret: 'test-secret', expiresIn: '15m' }),
      );
    });

    it('throws error when JWT secrets are missing', async () => {
      configStub.get.mockReturnValue(undefined);
      prismaStub.user.findUnique.mockResolvedValue(null);
      prismaStub.user.create.mockResolvedValue(mockUser);

      await expect(
        service.signup({ email: 'new@example.com', password: 'password' }),
      ).rejects.toThrow();
    });
  });
});
