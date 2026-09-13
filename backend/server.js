require('dotenv').config();

const http = require('http');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const pool = require('./db');
const auth = require('./auth');

const execFileAsync = promisify(execFile);

const readJsonBody = async (req) => {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });

        req.on('error', reject);
    });
};

const requireAuth = (req, res) => {
    const session = auth.getSession(req);

    if (!session) {
        res.writeHead(401, {
            'Content-Type': 'application/json'
        });

        res.end(JSON.stringify({
            error: 'Unauthorized'
        }));

        return null;
    }

    return session;
};

const server = http.createServer(async (req, res) => {

    // =========================================================
    // GET semua barang
    // =========================================================
    if (req.url === '/api/barang' && req.method === 'GET') {
        try {
            const result = await pool.query(
                'SELECT * FROM barang ORDER BY id'
            );

            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify(result.rows));

        } catch (error) {
            console.error('Database error:', error.message);

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal mengambil data barang',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // GET satu barang
    // =========================================================
    if (req.url.startsWith('/api/barang/') && req.method === 'GET') {
        const id = req.url.split('/')[3];

        try {
            const result = await pool.query(
                'SELECT * FROM barang WHERE id = $1',
                [id]
            );

            if (result.rows.length === 0) {
                res.writeHead(404, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    error: 'Barang tidak ditemukan'
                }));

                return;
            }

            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify(result.rows[0]));

        } catch (error) {
            console.error('Database error:', error.message);

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal mengambil data barang',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // POST tambah barang
    // =========================================================
    if (req.url === '/api/barang' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);

                if (!data.nama || data.stok === undefined) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'nama dan stok wajib diisi'
                    }));

                    return;
                }

                const result = await pool.query(
                    'INSERT INTO barang (nama, stok) VALUES ($1, $2) RETURNING *',
                    [data.nama, data.stok]
                );

                res.writeHead(201, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify(result.rows[0]));

            } catch (error) {
                console.error('Database error:', error.message);

                res.writeHead(400, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    error: 'Data tidak valid',
                    detail: error.message
                }));
            }
        });

        return;
    }


    // =========================================================
    // PATCH ubah barang
    // =========================================================
    if (req.url.startsWith('/api/barang/') && req.method === 'PATCH') {
        const id = req.url.split('/')[3];

        let body = '';

        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);

                if (data.nama === undefined && data.stok === undefined) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'Minimal nama atau stok harus diisi'
                    }));

                    return;
                }

                const result = await pool.query(
                    `UPDATE barang
                     SET
                         nama = COALESCE($1, nama),
                         stok = COALESCE($2, stok)
                     WHERE id = $3
                     RETURNING *`,
                    [
                        data.nama ?? null,
                        data.stok ?? null,
                        id
                    ]
                );

                if (result.rows.length === 0) {
                    res.writeHead(404, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'Barang tidak ditemukan'
                    }));

                    return;
                }

                res.writeHead(200, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify(result.rows[0]));

            } catch (error) {
                console.error('Database error:', error.message);

                res.writeHead(400, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    error: 'Data tidak valid',
                    detail: error.message
                }));
            }
        });

        return;
    }


    // =========================================================
    // DELETE barang
    // =========================================================
    if (req.url.startsWith('/api/barang/') && req.method === 'DELETE') {
        const id = req.url.split('/')[3];

        try {
            const result = await pool.query(
                'DELETE FROM barang WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                res.writeHead(404, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    error: 'Barang tidak ditemukan'
                }));

                return;
            }

            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                message: 'Barang berhasil dihapus',
                barang: result.rows[0]
            }));

        } catch (error) {
            console.error('Database error:', error.message);

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal menghapus barang',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // POST transaksi stok
    // =========================================================
    if (req.url === '/api/transaksi' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', async () => {
            const client = await pool.connect();

            try {
                const data = JSON.parse(body);

                const {
                    barang_id,
                    warehouse_id,
                    kriteria_id,
                    jenis,
                    jumlah
                } = data;

                // Validasi dasar
                if (
                    !barang_id ||
                    !warehouse_id ||
                    !kriteria_id ||
                    !jenis ||
                    jumlah === undefined
                ) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'barang_id, warehouse_id, kriteria_id, jenis, dan jumlah wajib diisi'
                    }));

                    return;
                }

                if (!['MASUK', 'KELUAR'].includes(jenis)) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'jenis harus MASUK atau KELUAR'
                    }));

                    return;
                }

                if (!Number.isInteger(jumlah) || jumlah <= 0) {
                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'jumlah harus berupa angka bulat lebih dari 0'
                    }));

                    return;
                }

                await client.query('BEGIN');


                // -------------------------------------------------
                // Pastikan master data benar-benar ada
                // -------------------------------------------------
                const masterData = await client.query(
                    `SELECT
                        (SELECT COUNT(*) FROM barang WHERE id = $1) AS barang,
                        (SELECT COUNT(*) FROM warehouse WHERE id = $2) AS warehouse,
                        (SELECT COUNT(*) FROM kriteria WHERE id = $3) AS kriteria`,
                    [
                        barang_id,
                        warehouse_id,
                        kriteria_id
                    ]
                );

                const master = masterData.rows[0];

                if (
                    Number(master.barang) === 0 ||
                    Number(master.warehouse) === 0 ||
                    Number(master.kriteria) === 0
                ) {
                    await client.query('ROLLBACK');

                    res.writeHead(404, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'Barang, warehouse, atau kriteria tidak ditemukan'
                    }));

                    return;
                }


                // -------------------------------------------------
                // Ambil stok dan lock baris
                // -------------------------------------------------
                const stockResult = await client.query(
                    `SELECT *
                     FROM stock_levels
                     WHERE barang_id = $1
                       AND warehouse_id = $2
                       AND kriteria_id = $3
                     FOR UPDATE`,
                    [
                        barang_id,
                        warehouse_id,
                        kriteria_id
                    ]
                );

                let stokSekarang = 0;

                if (stockResult.rows.length > 0) {
                    stokSekarang = stockResult.rows[0].jumlah;
                }


                // -------------------------------------------------
                // Cegah stok minus
                // -------------------------------------------------
                if (jenis === 'KELUAR' && stokSekarang < jumlah) {
                    await client.query('ROLLBACK');

                    res.writeHead(400, {
                        'Content-Type': 'application/json'
                    });

                    res.end(JSON.stringify({
                        error: 'Stok tidak mencukupi',
                        stok_sekarang: stokSekarang,
                        jumlah_diminta: jumlah
                    }));

                    return;
                }


                const perubahan =
                    jenis === 'MASUK'
                        ? jumlah
                        : -jumlah;

                const stokBaru = stokSekarang + perubahan;


                // -------------------------------------------------
                // Simpan transaksi
                // -------------------------------------------------
                const transaksiResult = await client.query(
                    `INSERT INTO transaksi
                        (
                            barang_id,
                            warehouse_id,
                            kriteria_id,
                            jenis,
                            jumlah
                        )
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING *`,
                    [
                        barang_id,
                        warehouse_id,
                        kriteria_id,
                        jenis,
                        jumlah
                    ]
                );


                // -------------------------------------------------
                // Update / buat saldo stok
                // -------------------------------------------------
                if (stockResult.rows.length === 0) {
                    await client.query(
                        `INSERT INTO stock_levels
                            (
                                barang_id,
                                warehouse_id,
                                kriteria_id,
                                jumlah
                            )
                         VALUES ($1, $2, $3, $4)`,
                        [
                            barang_id,
                            warehouse_id,
                            kriteria_id,
                            stokBaru
                        ]
                    );

                } else {
                    await client.query(
                        `UPDATE stock_levels
                         SET jumlah = $1
                         WHERE barang_id = $2
                           AND warehouse_id = $3
                           AND kriteria_id = $4`,
                        [
                            stokBaru,
                            barang_id,
                            warehouse_id,
                            kriteria_id
                        ]
                    );
                }


                await client.query('COMMIT');


                res.writeHead(201, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    message: 'Transaksi berhasil',
                    transaksi: transaksiResult.rows[0],
                    stok_sebelumnya: stokSekarang,
                    stok_sekarang: stokBaru
                }));

            } catch (error) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error(
                        'Rollback error:',
                        rollbackError.message
                    );
                }

                console.error(
                    'Transaction error:',
                    error.message
                );

                res.writeHead(400, {
                    'Content-Type': 'application/json'
                });

                res.end(JSON.stringify({
                    error: 'Transaksi gagal',
                    detail: error.message
                }));

            } finally {
                client.release();
            }
        });

        return;
    }


    // =========================================================
    // GET stok
    //
    // Bisa menggunakan filter:
    // ?warehouse_id=1
    // ?barang_id=1
    // ?kriteria_id=1
    //
    // Bisa juga kombinasi.
    // =========================================================
    if (
        req.method === 'GET' &&
        req.url.startsWith('/api/stock')
    ) {
        try {
            const url = new URL(
                req.url,
                'http://localhost'
            );

            const warehouseId =
                url.searchParams.get('warehouse_id');

            const barangId =
                url.searchParams.get('barang_id');

            const kriteriaId =
                url.searchParams.get('kriteria_id');


            let query = `
                SELECT
                    sl.id,
                    sl.barang_id,
                    b.nama AS barang,
                    sl.warehouse_id,
                    w.nama AS warehouse,
                    sl.kriteria_id,
                    k.nama AS kriteria,
                    sl.jumlah
                FROM stock_levels sl
                JOIN barang b
                    ON b.id = sl.barang_id
                JOIN warehouse w
                    ON w.id = sl.warehouse_id
                JOIN kriteria k
                    ON k.id = sl.kriteria_id
                WHERE 1 = 1
            `;

            const values = [];


            if (warehouseId) {
                values.push(warehouseId);

                query += `
                    AND sl.warehouse_id = $${values.length}
                `;
            }


            if (barangId) {
                values.push(barangId);

                query += `
                    AND sl.barang_id = $${values.length}
                `;
            }


            if (kriteriaId) {
                values.push(kriteriaId);

                query += `
                    AND sl.kriteria_id = $${values.length}
                `;
            }


            query += `
                ORDER BY
                    b.nama,
                    w.nama,
                    k.nama
            `;


            const result = await pool.query(
                query,
                values
            );


            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify(result.rows));

        } catch (error) {
            console.error(
                'Stock error:',
                error.message
            );

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal mengambil stok',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // GET riwayat transaksi
    //
    // Filter:
    // ?barang_id=1
    // ?warehouse_id=1
    // ?kriteria_id=1
    // ?jenis=MASUK
    // ?from=2026-09-01
    // ?to=2026-09-12
    //
    // Semua filter bisa dikombinasikan.
    // =========================================================
    if (
        req.method === 'GET' &&
        req.url.startsWith('/api/transaksi')
    ) {
        try {
            const url = new URL(
                req.url,
                'http://localhost'
            );

            const barangId =
                url.searchParams.get('barang_id');

            const warehouseId =
                url.searchParams.get('warehouse_id');

            const kriteriaId =
                url.searchParams.get('kriteria_id');

            const jenis =
                url.searchParams.get('jenis');

            const from =
                url.searchParams.get('from');

            const to =
                url.searchParams.get('to');


            let query = `
                SELECT
                    t.id,
                    t.barang_id,
                    b.nama AS barang,
                    t.warehouse_id,
                    w.nama AS warehouse,
                    t.kriteria_id,
                    k.nama AS kriteria,
                    t.jenis,
                    t.jumlah,
                    t.created_at
                FROM transaksi t
                JOIN barang b
                    ON b.id = t.barang_id
                JOIN warehouse w
                    ON w.id = t.warehouse_id
                JOIN kriteria k
                    ON k.id = t.kriteria_id
                WHERE 1 = 1
            `;

            const values = [];


            if (barangId) {
                values.push(barangId);

                query += `
                    AND t.barang_id = $${values.length}
                `;
            }


            if (warehouseId) {
                values.push(warehouseId);

                query += `
                    AND t.warehouse_id = $${values.length}
                `;
            }


            if (kriteriaId) {
                values.push(kriteriaId);

                query += `
                    AND t.kriteria_id = $${values.length}
                `;
            }


            if (jenis) {
                values.push(jenis);

                query += `
                    AND t.jenis = $${values.length}
                `;
            }


            if (from) {
                values.push(from);

                query += `
                    AND t.created_at >= $${values.length}::date
                `;
            }


            if (to) {
                values.push(to);

                query += `
                    AND t.created_at < ($${values.length}::date + INTERVAL '1 day')
                `;
            }


            query += `
                ORDER BY
                    t.created_at DESC,
                    t.id DESC
            `;


            const result = await pool.query(
                query,
                values
            );


            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify(result.rows));

        } catch (error) {
            console.error(
                'Transaction history error:',
                error.message
            );

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal mengambil riwayat transaksi',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // POST login
    // =========================================================
    if (req.url === '/api/auth/login' && req.method === 'POST') {
        const clientIp = req.socket.remoteAddress || 'unknown';

        if (!auth.checkRateLimit(clientIp)) {
            res.writeHead(429, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Terlalu banyak percobaan login. Coba lagi nanti.'
            }));

            return;
        }

        let data;

        try {
            data = await readJsonBody(req);
        } catch (error) {
            res.writeHead(400, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Body harus berupa JSON yang valid'
            }));

            return;
        }

        const username =
            typeof data.username === 'string' ? data.username : '';
        const password =
            typeof data.password === 'string' ? data.password : '';

        if (auth.verifyCredentials(username, password)) {
            const token = auth.createSession(username);
            const cookie = auth.getSetCookie(token);

            auth.clearFailures(clientIp);

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Set-Cookie': cookie
            });

            res.end(JSON.stringify({
                authenticated: true,
                username: username
            }));

            return;
        }

        auth.recordFailure(clientIp);

        res.writeHead(401, {
            'Content-Type': 'application/json'
        });

        res.end(JSON.stringify({
            error: 'Username atau password salah'
        }));

        return;
    }


    // =========================================================
    // GET status autentikasi saat ini
    // =========================================================
    if (req.url === '/api/auth/me' && req.method === 'GET') {
        const session = auth.getSession(req);

        if (!session) {
            res.writeHead(401, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                authenticated: false
            }));

            return;
        }

        res.writeHead(200, {
            'Content-Type': 'application/json'
        });

        res.end(JSON.stringify({
            authenticated: true,
            username: session.username
        }));
        return;
    }


    // =========================================================
    // POST logout
    // =========================================================
    if (req.url === '/api/auth/logout' && req.method === 'POST') {
        auth.logout(req);

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': auth.getClearCookie()
        });

        res.end(JSON.stringify({
            authenticated: false
        }));
        return;
    }


    // =========================================================
    // GET info sistem / monitoring server
    // =========================================================
    if (req.url === '/api/system' && req.method === 'GET') {
        if (!requireAuth(req, res)) {
            return;
        }

        try {
            const MB = 1024 * 1024;
            const GB = 1024 * 1024 * 1024;

            const cpus = os.cpus();

            const sumCpuTimes = (cpuList) => cpuList.reduce(
                (acc, cpu) => {
                    acc.idle += cpu.times.idle;
                    acc.total +=
                        cpu.times.user +
                        cpu.times.nice +
                        cpu.times.sys +
                        cpu.times.idle +
                        cpu.times.irq;

                    return acc;
                },
                { idle: 0, total: 0 }
            );

            const getCpuUsage = async () => {
                const start = sumCpuTimes(os.cpus());

                await new Promise(resolve => setTimeout(resolve, 200));

                const end = sumCpuTimes(os.cpus());

                const totalDelta = end.total - start.total;
                const idleDelta = end.idle - start.idle;

                if (totalDelta <= 0) {
                    return 0;
                }

                return Number(
                    (((totalDelta - idleDelta) / totalDelta) * 100)
                        .toFixed(2)
                );
            };

            const readMemInfo = async () => {
                try {
                    const raw = await fs.promises.readFile(
                        '/proc/meminfo',
                        'utf8'
                    );

                    const get = (name) => {
                        const match = raw.match(
                            new RegExp(`^${name}:\\s+(\\d+)`)
                        );

                        return match ? Number(match[1]) : null;
                    };

                    return {
                        totalKb: get('MemTotal'),
                        freeKb: get('MemFree'),
                        availableKb: get('MemAvailable')
                    };
                } catch (error) {
                    return null;
                }
            };

            const getDiskInfo = (path) => {
                const info = fs.statfsSync(path);

                const totalBytes = info.blocks * info.bsize;
                const usedBytes =
                    totalBytes - (info.bfree * info.bsize);

                return {
                    total_gb: Number(
                        (totalBytes / GB).toFixed(2)
                    ),
                    used_gb: Number(
                        (usedBytes / GB).toFixed(2)
                    ),
                    free_gb: Number(
                        ((info.bfree * info.bsize) / GB).toFixed(2)
                    ),
                    usage_percent: Number(
                        ((usedBytes / totalBytes) * 100).toFixed(2)
                    )
                };
            };

            const disk = {
                root: getDiskInfo('/')
            };

            try {
                disk.data = getDiskInfo('/data');
            } catch (error) {
                console.warn(
                    '/data tidak tersedia:',
                    error.message
                );

                disk.data = null;
            }

            const memInfo = await readMemInfo();

            const memTotal = os.totalmem();
            const memFree = os.freemem();

            let memData;

            if (
                memInfo &&
                memInfo.totalKb > 0 &&
                memInfo.availableKb > 0
            ) {
                const totalMb = memInfo.totalKb / 1024;
                const availableMb = memInfo.availableKb / 1024;
                const freeMb = memInfo.freeKb / 1024;
                const usedMb = totalMb - availableMb;

                memData = {
                    total_mb: totalMb,
                    used_mb: usedMb,
                    free_mb: freeMb,
                    available_mb: availableMb,
                    usage_percent: (usedMb / totalMb) * 100
                };

            } else {
                const totalMb = memTotal / MB;
                const freeMb = memFree / MB;
                const usedMb = totalMb - freeMb;

                memData = {
                    total_mb: totalMb,
                    used_mb: usedMb,
                    free_mb: freeMb,
                    available_mb: freeMb,
                    usage_percent: (usedMb / totalMb) * 100
                };
            }

            const loadAverage = os.loadavg();

            const cpuUsage = await getCpuUsage();

            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                hostname: os.hostname(),
                platform: os.platform(),
                arch: os.arch(),
                cpu: {
                    model: cpus[0].model,
                    cores: cpus.length,
                    usage_percent: cpuUsage
                },
                memory: {
                    total_mb: Math.round(memData.total_mb),
                    used_mb: Math.round(memData.used_mb),
                    free_mb: Math.round(memData.free_mb),
                    available_mb: Math.round(memData.available_mb),
                    usage_percent: Number(
                        memData.usage_percent.toFixed(2)
                    )
                },
                load_average: {
                    '1m': Number(loadAverage[0].toFixed(2)),
                    '5m': Number(loadAverage[1].toFixed(2)),
                    '15m': Number(loadAverage[2].toFixed(2))
                },
                disk: disk,
                uptime_seconds: Math.floor(os.uptime()),
                timestamp: new Date().toISOString()
            }));

        } catch (error) {
            console.error(
                'System monitoring error:',
                error.message
            );

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal mengambil info sistem',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // GET status service systemd
    // =========================================================
    if (req.url === '/api/services' && req.method === 'GET') {
        if (!requireAuth(req, res)) {
            return;
        }

        try {
            const getServiceStatus = async (service) => {
                try {
                    const { stdout } = await execFileAsync(
                        'systemctl',
                        [
                            'show',
                            service,
                            '--property=ActiveState,LoadState'
                        ]
                    );

                    const activeState =
                        (
                            stdout.match(/^ActiveState=(.+)$/m) || []
                        )[1]?.trim();

                    const loadState =
                        (
                            stdout.match(/^LoadState=(.+)$/m) || []
                        )[1]?.trim();

                    if (loadState === 'not-found') {
                        return 'unknown';
                    }

                    switch (activeState) {
                        case 'active':
                            return 'running';
                        case 'inactive':
                            return 'stopped';
                        case 'failed':
                            return 'failed';
                        default:
                            return 'unknown';
                    }

                } catch (error) {
                    console.warn(
                        'Tidak bisa cek service:',
                        service,
                        error.message
                    );

                    return 'unknown';
                }
            };

            const services = [
                { name: 'Node.js API', service: 'belajar-node' },
                { name: 'PostgreSQL', service: 'postgresql' },
                { name: 'Nginx', service: 'nginx' },
                { name: 'Samba', service: 'smbd' },
                { name: 'Cloudflare Tunnel', service: 'cloudflared' },
                { name: 'Tailscale', service: 'tailscaled' }
            ];

            const results = await Promise.all(
                services.map(async (item) => {
                    const status = await getServiceStatus(item.service);

                    return {
                        name: item.name,
                        service: item.service,
                        status: status
                    };
                })
            );

            res.writeHead(200, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                services: results
            }));

        } catch (error) {
            console.error(
                'Services monitoring error:',
                error.message
            );

            res.writeHead(500, {
                'Content-Type': 'application/json'
            });

            res.end(JSON.stringify({
                error: 'Gagal mengambil status service',
                detail: error.message
            }));
        }

        return;
    }


    // =========================================================
    // GET health check ringan (tidak membocorkan secret)
    // =========================================================
    if (req.url === '/api/health' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'application/json'
        });

        res.end(JSON.stringify({
            status: 'ok'
        }));

        return;
    }


    // =========================================================
    // Endpoint tidak ditemukan
    // =========================================================
    res.writeHead(404, {
        'Content-Type': 'application/json'
    });

    res.end(JSON.stringify({
        error: 'Endpoint tidak ditemukan'
    }));
});


const HOST = process.env.HOST || '127.0.0.1';

server.listen(3000, HOST, () => {
    console.log(`API berjalan di ${HOST}:3000`);
});
