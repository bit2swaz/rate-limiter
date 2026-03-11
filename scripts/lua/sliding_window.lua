-- KEYS[1] = rate limit key
-- ARGV[1] = window_ms, ARGV[2] = limit, ARGV[3] = now (ms)
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cutoff = now - window

-- remove entries that have fallen outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)

if count < limit then
  -- append unique member using random suffix to avoid score collisions
  redis.call('ZADD', key, now, now .. math.random())
  redis.call('PEXPIRE', key, window)
  local remaining = limit - count - 1
  return {1, remaining}  -- {allowed, remaining_slots}
else
  return {0, 0}  -- rejected, no slots remaining
end
