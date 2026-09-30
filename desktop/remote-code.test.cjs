const { test } = require("node:test");
const assert = require("node:assert/strict");
const { verifyRemoteCode, DEFAULT_CODES_URL } = require("./remote-code.cjs");
test("matches whole six-digit lines, preserves leading zero, bypasses caches", async () => {
  let calls=0;
  const fetcher=async (url, options)=>{calls++;assert.ok(url.startsWith(DEFAULT_CODES_URL));assert.equal(options.cache,"no-store");return new Response("\uFEFF012345\r\n123456\r\n# 555555\r\n1234567\r\n");};
  assert.equal((await verifyRemoteCode("012345",{fetcher})).valid,true);
  assert.equal((await verifyRemoteCode("234567",{fetcher})).kind,"invalid");
  assert.equal((await verifyRemoteCode("555555",{fetcher})).valid,false);
  assert.equal(calls,3);
});
test("invalid input never requests the list", async()=>{
  const fetcher=()=>{throw new Error("should not request")};
  for(const code of ["", "12345", "1234567", "abcdef"]) assert.equal((await verifyRemoteCode(code,{fetcher})).kind,"invalid");
});
test("network, missing file, empty file and invalid configuration are distinct errors", async()=>{
  assert.equal((await verifyRemoteCode("123456",{fetcher:async()=>{throw new Error("offline")}})).kind,"network");
  assert.equal((await verifyRemoteCode("123456",{fetcher:async()=>new Response("",{status:404})})).kind,"service");
  assert.equal((await verifyRemoteCode("123456",{fetcher:async()=>new Response("<html>Not found</html>")})).kind,"service");
  assert.equal((await verifyRemoteCode("123456",{url:"http://example.test/codes.txt"})).kind,"configuration");
});
