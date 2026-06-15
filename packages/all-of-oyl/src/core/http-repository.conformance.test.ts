import { httpProtocolContract } from './http-repository-contract.js'
import { createProtocolFake } from './http-repository-fake.js'

// Fresh fake per repo so each contract case starts empty (R1: same harness later points at a real server).
httpProtocolContract('HttpRepository (protocol fake)', () => ({
  baseUrl: 'http://fake',
  fetch: createProtocolFake().fetch,
  getToken: async () => 'test',
}))
