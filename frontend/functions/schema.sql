-- D1 Database Schema for 2HJS Tracker on Cloudflare
-- This is a simplified schema for the Cloudflare Workers migration

-- Users table (simplified - auth handled by Cloudflare Access)
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  tenantId TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'USER',  -- 'USER' or 'ADMIN'

  -- E2E encryption metadata
  publicKey TEXT,  -- User's public key for verification
  keyFingerprint TEXT,  -- For device recognition
  keyCreatedAt TEXT,

  -- E2E encrypted data blob
  encryptedData TEXT,  -- E2E encrypted JSON containing all user data
  dataVersion INTEGER DEFAULT 0,  -- For encryption migrations

  -- Usage tracking
  storageUsed INTEGER DEFAULT 0,  -- Bytes
  requestCount INTEGER DEFAULT 0,  -- API requests this month
  lastRequestAt TEXT,

  -- Timestamps
  firstSeenAt TEXT NOT NULL DEFAULT (datetime('now')),
  lastLoginAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_user_email ON User(email);
CREATE INDEX idx_user_tenantId ON User(tenantId);

-- Employers table
CREATE TABLE IF NOT EXISTS Employer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  location TEXT,
  notes TEXT,

  -- LAMP scores
  advocacy INTEGER DEFAULT 0,  -- 0 or 1 (Boolean stored as int)
  motivation INTEGER DEFAULT 0,
  posting INTEGER DEFAULT 1,

  -- Computed rank
  lampRank INTEGER,

  -- Status
  status TEXT DEFAULT 'ACTIVE',  -- ACTIVE, ON_HOLD, RULED_OUT, OFFER_RECEIVED
  isNetworkOrg INTEGER DEFAULT 0,  -- Boolean stored as int

  -- Multi-tenancy
  userId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_employer_userId ON Employer(userId);

-- Contacts table
CREATE TABLE IF NOT EXISTS Contact (
  id TEXT PRIMARY KEY,
  employerId TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  linkedInUrl TEXT,
  phone TEXT,

  -- Prioritization
  isFunctionallyRelevant INTEGER DEFAULT 0,
  isAlumni INTEGER DEFAULT 0,
  levelAboveTarget INTEGER DEFAULT 0,
  isInternallyPromoted INTEGER DEFAULT 0,
  hasUniqueName INTEGER DEFAULT 0,

  -- Contact method
  contactMethod TEXT,  -- LINKEDIN_GROUP, DIRECT_EMAIL_ALUMNI, etc.

  -- Segment
  segment TEXT DEFAULT 'UNKNOWN',  -- UNKNOWN, BOOSTER, OBLIGATE, CURMUDGEON

  priority INTEGER DEFAULT 1,

  -- Multi-tenancy
  userId TEXT,
  notes TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (employerId) REFERENCES Employer(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_contact_userId ON Contact(userId);
CREATE INDEX idx_contact_employerId ON Contact(employerId);

-- Outreach table
CREATE TABLE IF NOT EXISTS Outreach (
  id TEXT PRIMARY KEY,
  employerId TEXT NOT NULL,
  contactId TEXT NOT NULL,

  -- Email details
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  wordCount INTEGER NOT NULL,

  -- Tracking
  sentAt TEXT NOT NULL,
  threeB_Date TEXT NOT NULL,
  sevenB_Date TEXT NOT NULL,

  -- Response tracking
  responseAt TEXT,
  responseType TEXT,  -- POSITIVE, NEGATIVE, DELAYED_POSITIVE, REFERRAL_ONLY, OUT_OF_OFFICE

  -- Follow-up tracking
  followUpSentAt TEXT,
  followUpBody TEXT,

  -- Status
  status TEXT DEFAULT 'SENT',  -- DRAFT, SENT, AWAITING_3B, MOVED_ON, etc.

  -- Google integration
  gmailDraftId TEXT,
  gmailMessageId TEXT,
  calendarEventId TEXT,

  -- Multi-tenancy
  userId TEXT,
  notes TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (employerId) REFERENCES Employer(id) ON DELETE CASCADE,
  FOREIGN KEY (contactId) REFERENCES Contact(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_outreach_userId ON Outreach(userId);
CREATE INDEX idx_outreach_employerId ON Outreach(employerId);
CREATE INDEX idx_outreach_contactId ON Outreach(contactId);

-- Informationals table
CREATE TABLE IF NOT EXISTS Informational (
  id TEXT PRIMARY KEY,
  contactId TEXT NOT NULL,

  scheduledAt TEXT NOT NULL,
  duration INTEGER DEFAULT 30,
  method TEXT DEFAULT 'PHONE',  -- PHONE, VIDEO, IN_PERSON

  -- Preparation
  researchNotes TEXT,
  bigFourAnswers TEXT,  -- JSON string
  tiaraQuestions TEXT,  -- JSON string

  -- Outcome
  completedAt TEXT,
  outcome TEXT,  -- REFERRAL_OFFERED, NO_REFERRAL, FOLLOW_UP_SCHEDULED, DEAD_END
  referralName TEXT,
  referralContact TEXT,
  nextSteps TEXT,

  -- Google integration
  calendarEventId TEXT,

  -- Multi-tenancy
  userId TEXT,
  notes TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (contactId) REFERENCES Contact(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_informational_userId ON Informational(userId);
CREATE INDEX idx_informational_contactId ON Informational(contactId);

-- Email Templates table
CREATE TABLE IF NOT EXISTS EmailTemplate (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- SIX_POINT_INITIAL, SIX_POINT_NO_CONNECTION, etc.
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT,  -- JSON array as string
  wordCount INTEGER NOT NULL,
  isDefault INTEGER DEFAULT 0,

  -- Multi-tenancy
  userId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_emailTemplate_userId ON EmailTemplate(userId);

-- Settings table
CREATE TABLE IF NOT EXISTS Settings (
  id TEXT PRIMARY KEY,

  -- Multi-tenancy
  userId TEXT UNIQUE,

  -- Google OAuth tokens
  googleAccessToken TEXT,
  googleRefreshToken TEXT,
  googleTokenExpiry TEXT,

  -- User preferences
  defaultTimezone TEXT DEFAULT 'America/New_York',
  workdayStart TEXT DEFAULT '09:00',
  workdayEnd TEXT DEFAULT '17:00',
  preferredCalendarId TEXT,

  -- Claude API
  claudeApiKey TEXT,

  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_settings_userId ON Settings(userId);

-- Chat Messages table
CREATE TABLE IF NOT EXISTS ChatMessage (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,  -- USER, ASSISTANT, SYSTEM
  content TEXT NOT NULL,
  metadata TEXT,  -- JSON string

  -- Multi-tenancy
  userId TEXT,
  createdAt TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_chatMessage_userId ON ChatMessage(userId);

-- Usage Metrics table (for admin dashboard)
CREATE TABLE IF NOT EXISTS UsageMetrics (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  metricType TEXT NOT NULL,  -- STORAGE_BYTES, API_REQUEST, D1_READ, D1_WRITE
  value INTEGER NOT NULL,
  timestamp TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_usageMetrics_userId ON UsageMetrics(userId);
CREATE INDEX idx_usageMetrics_timestamp ON UsageMetrics(timestamp);
