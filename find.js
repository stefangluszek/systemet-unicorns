const https = require('https');
const querystring = require('querystring');
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

function getStockPromise(productId) {
    const opts = {
        path: getStockPrefix + productId
    }

    Object.assign(opts, defaultOpts);
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
            console.log('HTTP request timed out.');
            resolve({});
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

function getItemsPromise(cat1, cat2, page) {
    const query = querystring.stringify({
        isInOnlineStoreSearchAssortment: true,
        postalCode: postalCode,
        isInOnlineHomeSearchAssortment: true,
        size: 30,
        page: page,
        categoryLevel1: cat1,
        categoryLevel2: cat2,
    });

    const opts = {
        path: searchPrefix + query
    }

    Object.assign(opts, defaultOpts);

    // TODO: This code is the same as getStockPromise, make it a generic function.
    return new Promise((resolve, reject) => {
        const req = https.request(opts, (res) => {
            let stream;
            let data = '';
            let enc = res.headers['content-encoding'];

            res.setTimeout(1000, () => {
                console.log('HTTP request timed out.');
                resolve({ });
            });

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
        req.on('error', (e) => {
            reject(e);
        });

        req.on('timeout', () => {
            console.log('HTTP request timed out.');
            resolve({ });
        });
        req.end();
    });
}

async function getItems(cat1, cat2) {
    let items = [];
    let page = 1;
    do {
        console.log('page: ', page);
        let i = await getItemsPromise(cat1, cat2, page);

        if (i.metadata == undefined)
            break;

        page = i.metadata.nextPage;
        items.push(...i.products);
    } while (page > 0);
    return items;
}

itemsMap = {};

function getStock(items) {
    let getStockPromises = items.map(item => getStockPromise(item.productId));
    items.map(item => {
        itemsMap[item.productId] = item;
    });
    // TODO: Right now we will send all stock (~120 * 15) requests at the same
    // time. This makes a lot of the requst time out. It would be better to get
    // the stock for each page before moving on to the next page, this way we
    // only send 15 stock requests at once.
    return Promise.all(getStockPromises)
}

function findUnicorns(stock) {
    stock.forEach(i => {
        if (i.stock > 0 && i.stock <= unicornLevel) {
            p = itemsMap[i.productId];
            process.stdout.write(`${p.productNameBold}[${p.productNumber}]: ${p.price}kr [${i.stock}]\n`);
        }
    });
}

if (args.length != 5) {
    console.log("Usage: node find.js <post code> <categoryLevel1> <categoryLevel2> <unicornLevel> <apiKey>");
    console.log("Example: node find.js 58925 Öl Ale 1 secretApiKey");
    console.log("         will find all Ales that with online stock 1.");
    process.exit(1);
}

getItems(categoryLevel1, categoryLevel2)
    .then(getStock)
    .then(findUnicorns);
