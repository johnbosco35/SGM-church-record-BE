// Runs before every test file, before any application module reads process.env.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/unused';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-123456';
process.env.BCRYPT_ROUNDS ??= '4';
process.env.RATE_LIMIT_ENABLED ??= 'false';
process.env.UPLOAD_DIR ??= './uploads-test';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.CHAT_PROVIDER ??= 'mock';
process.env.EXTRACTION_PROVIDER ??= 'mock';
