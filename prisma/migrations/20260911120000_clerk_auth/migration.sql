◇ injected env (22) from .env.local // tip: ◈ secrets for agents [www.dotenvx.com]
◇ injected env (0) from .env // tip: ⌘ custom filepath { path: '/custom/path/.env' }
-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "emailVerified";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "VerificationToken";

