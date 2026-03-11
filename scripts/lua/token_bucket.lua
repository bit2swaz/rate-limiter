-- KEYS[1] = rate limit key
-- ARGV[1] = capacity, ARGV[2] = refill_rate/sec, ARGV[3] = now (ms)
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- calculate tokens earned since last refill
local elapsed = (now - last_refill) / 1000
local new_tokens = math.min(capacity, tokens + elapsed * refill_rate)

if new_tokens >= 1 then
  local remaining = math.floor(new_tokens - 1)
  redis.call('HMSET', key, 'tokens', new_tokens - 1, 'last_refill', now)
  redis.call('PEXPIRE', key, 60000)
  return {1, remaining}  -- {allowed, remaining_tokens}
else
  return {0, 0}  -- rejected, no tokens remaining
end
