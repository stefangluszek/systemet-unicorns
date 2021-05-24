const querystring = require('querystring');
const https = require('https');
const zlib = require('zlib');

const searchPrefix = '/sb-api-ecommerce/v1/productsearch/search?';
const getStockPrefix = '/sb-api-ecommerce/v1/stockbalance/depot/1899/';

const args = process.argv.slice(2);
const postalCode = args[0];
const categoryLevel1 = args[1];
const categoryLevel2 = args[2];
const unicornLevel = args[3];
const apiKey = args[4];

const defaultOpts = {
    hostname: 'api-extern.systembolaget.se',
    port: 443,
    method: 'GET',
    headers: {
        'ocp-apim-subscription-key': apiKey,
        'accept': 'application/json',
        'accept-encoding': 'gzip'
    },
    timeout: 3000,
};

function HTTPRequest(opts) {
    return new Promise((resolve, reject) => {
        const req = https.request(opts, (res) => {
            let stream;
            let data = '';
            let enc = res.headers['content-encoding'];
            if (enc == 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else {
                stream = res;
            }
            stream.on('data', (d) => {
                data += d;
            });
            stream.on('end', () => {
                resolve(JSON.parse(data));
            });
            stream.on('error', (e) => {
                reject(e);
            });
        });
        req.on('timeout', () => {
            reject('HTTP Timeout');
        });

        req.on('error', (e) => {
            reject(e);
        });
        req.end();
    });
}

function getStock(productId) {
    const opts = {
        path: getStockPrefix + productId
    }
    Object.assign(opts, defaultOpts);
    return HTTPRequest(opts);
}

async function getItems(items, cat1, cat2, page) {
    if (page < 0)
    {
        return items;
    }

    console.log(page);

    const query = querystring.stringify({
        isInOnlineStoreSearchAssortment: true,
        postalCode: postalCode,
        isInOnlineHomeSearchAssortment: true,
        size: 10,
        page: page,
        categoryLevel1: cat1,
        categoryLevel2: cat2,
    });

    const opts = {
        path: searchPrefix + query
    }

    Object.assign(opts, defaultOpts);
    try {
        let i = await HTTPRequest(opts);

        if (i.metadata == undefined)
            return items;

        let getStockPromises = i.products.map(item => getStock(item.productId));
        let stock = await Promise.all(getStockPromises);
        let ids = stock.filter(s => s.stock == unicornLevel).map(i => i.productId);
        let unicorns = i.products.filter(p => {
            return ids.indexOf(p.productId) != -1;
        });
        items.push(...unicorns);

        return await getItems(items, cat1, cat2, i.metadata.nextPage);
    } catch(e) {
        console.error(e);
    }
}

function printResult(res) {
    if (!res || !res.length)
    {
        console.log('Didn\'t find any unicorns this time, good luck next time.');
        return;
    }

    res.forEach(i => {
        process.stdout.write(`${i.productNameBold}[${i.productNumber}]: ${i.price}kr\n`);
    });
}

if (args.length != 5) {
    console.log("Usage: node find.js <post code> <categoryLevel1> <categoryLevel2> <unicornLevel> <apiKey>");
    console.log("Example: node find.js 58925 Öl Ale 1 secretApiKey");
    console.log("         will find all Ales that with online stock 1.");
    process.exit(1);
}

getItems([], categoryLevel1, categoryLevel2, 1)
    .then(printResult);
