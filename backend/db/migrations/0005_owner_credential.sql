-- =====================================================================
-- 0005_owner_credential.sql — 사장님 아이디·비밀번호 로그인 (사용자 요청 2026-10-03)
-- 가입 수단(명세 Q2)은 미정이라 카카오·개발용과 함께 쓰는 추가 수단으로 둔다.
-- 계정당 하나, 탈퇴 시 계정과 함께 삭제(CASCADE). 비밀번호는 bcrypt 해시만 저장.
-- =====================================================================
CREATE TABLE IF NOT EXISTS owner_credential (
  account_id     BIGINT       NOT NULL,
  login_id       VARCHAR(50)  NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_owner_credential PRIMARY KEY (account_id),
  CONSTRAINT uq_owner_credential_login UNIQUE (login_id),
  CONSTRAINT fk_oc_account FOREIGN KEY (account_id) REFERENCES account (account_id) ON DELETE CASCADE
);
