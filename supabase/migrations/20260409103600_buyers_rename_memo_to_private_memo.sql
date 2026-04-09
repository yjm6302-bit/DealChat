-- buyers 테이블의 memo 컬럼을 private_memo로 이름 변경 (기존 데이터 그대로 보존)
ALTER TABLE buyers RENAME COLUMN memo TO private_memo;
