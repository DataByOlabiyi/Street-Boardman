// Result evidence photos (FEAT-042): uploads are checked by their bytes,
// stripped of metadata, stored under random names, and attachable only by
// the Boardman who uploaded them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../../server/app');
const env = require('../../server/config/env');
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, approvedBoardman, fundedBetter, openCompetition } = require('../helpers/fixtures');

// A minimal JPEG: SOI, an EXIF APP1 segment with a fake GPS tag, a JFIF
// APP0 segment, start-of-scan, a little "image data", EOI.
function jpegWithExif() {
  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPS:6.5244N,3.3792E')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(app1Payload.length + 2), app1Payload]);
  const app0Payload = Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1');
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), u16(app0Payload.length + 2), app0Payload]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xbb, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, app0, sos]);
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); // CRC not checked here
}

function pngWithText() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('tEXt', Buffer.from('Author\0Secret Location', 'latin1')),
    pngChunk('IDAT', Buffer.from([1, 2, 3])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

let originalDir;
let tempDir;

beforeAll(() => {
  originalDir = env.uploads.dir;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-uploads-'));
  env.uploads.dir = tempDir;
});

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  env.uploads.dir = originalDir;
  fs.rmSync(tempDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

const upload = (agent, bytes, type) => agent.post('/api/uploads/evidence').set('Content-Type', type).send(bytes);

describe('Uploading evidence photos (FEAT-042)', () => {
  it('stores a JPEG without its EXIF data and serves it back', async () => {
    const bm = await approvedBoardman();
    const res = await upload(bm.agent, jpegWithExif(), 'image/jpeg');
    expect(res.status).toBe(201);
    expect(res.body.upload).toMatchObject({ contentType: 'image/jpeg', url: `/api/uploads/evidence/${res.body.upload.id}` });

    const stored = fs.readFileSync(path.join(tempDir, `${res.body.upload.id}.jpg`));
    expect(stored.includes(Buffer.from('GPS:'))).toBe(false);
    expect(stored.includes(Buffer.from('JFIF'))).toBe(true);
    expect(stored.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));

    const served = await request(app).get(res.body.upload.url).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(served.body, stored)).toBe(0);
  });

  it('strips PNG text chunks', async () => {
    const bm = await approvedBoardman();
    const res = await upload(bm.agent, pngWithText(), 'image/png');
    expect(res.status).toBe(201);
    const stored = fs.readFileSync(path.join(tempDir, `${res.body.upload.id}.png`));
    expect(stored.includes(Buffer.from('Secret Location'))).toBe(false);
    expect(stored.includes(Buffer.from('IDAT'))).toBe(true);
  });

  it('judges the file by its bytes, not its Content-Type', async () => {
    const bm = await approvedBoardman();
    const filesBefore = fs.readdirSync(tempDir).length;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(bm.agent, svg, 'image/png')).status).toBe(415);
    expect((await upload(bm.agent, Buffer.from('GIF89a....'), 'image/jpeg')).status).toBe(415);
    expect((await bm.agent.post('/api/uploads/evidence').set('Content-Type', 'image/svg+xml').send(svg)).status).toBe(422);
    expect(fs.readdirSync(tempDir).length).toBe(filesBefore); // nothing stored
  });

  it('refuses photos over 5 MB and uploads from non-Boardmen', async () => {
    const bm = await approvedBoardman();
    const big = Buffer.concat([jpegWithExif(), Buffer.alloc(5 * 1024 * 1024)]);
    expect((await upload(bm.agent, big, 'image/jpeg')).status).toBe(413);

    const better = await fundedBetter(100);
    expect((await upload(better.agent, jpegWithExif(), 'image/jpeg')).status).toBe(403);
    expect((await upload(request.agent(app), jpegWithExif(), 'image/jpeg')).status).toBe(401);
  });

  it('attaches only the Boardman\'s own, unused photos to a result', async () => {
    const bm = await approvedBoardman();
    const other = await approvedBoardman();
    const mine = (await upload(bm.agent, jpegWithExif(), 'image/jpeg')).body.upload;
    const theirs = (await upload(other.agent, jpegWithExif(), 'image/jpeg')).body.upload;
    const competition = await openCompetition(bm);
    await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
    const submit = (ids) =>
      bm.agent.post(`/api/competitions/${competition.id}/result`).send({ winningOptionId: competition.betOptions[0].id, evidenceUploadIds: ids });

    expect((await submit([theirs.id])).status).toBe(422);
    const ok = await submit([mine.id]);
    expect(ok.status).toBe(201);
    expect(ok.body.result.evidenceUrls).toEqual([mine.url]);
    expect((await prisma.upload.findUnique({ where: { id: mine.id } })).attachedToResultId).toBe(ok.body.result.id);

    // The same photo can't be reused on another result.
    const second = await openCompetition(bm, 'Rematch');
    await bm.agent.patch(`/api/competitions/${second.id}/close-betting`);
    const reuse = await bm.agent.post(`/api/competitions/${second.id}/result`).send({ winningOptionId: second.betOptions[0].id, evidenceUploadIds: [mine.id] });
    expect(reuse.status).toBe(422);
  });

  it('returns 404 for unknown evidence', async () => {
    expect((await request(app).get('/api/uploads/evidence/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});
