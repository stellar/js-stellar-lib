import {CallBuilder} from "./call_builder";

/**
 * Creates a new {@link TradesCallBuilder} pointed to server defined by serverUrl.
 *
 * Do not create this object directly, use {@link Server#orderbook}.
 * @see [Orderbook Details](https://www.stellar.org/developers/horizon/reference/orderbook-details.html)
 * @param {string} serverUrl serverUrl Horizon server URL.
 */
export class TradesCallBuilder extends CallBuilder {
    constructor(serverUrl) {
        super(serverUrl);
        this.url.segment('trades');
    }

    /**
    * Filter trades for a specific asset pair (orderbook)
    * @param {Asset} base asset
    * @param {Asset} counter asset
    * @returns {TradesCallBuilder}
    */
    withAssetPair(base, counter) {
        if (!base.isNative()) {
            this.url.addQuery("base_asset_type", base.getAssetType());
            this.url.addQuery("base_asset_code", base.getCode());
            this.url.addQuery("base_asset_issuer", base.getIssuer());
        } else {
            this.url.addQuery("base_asset_type", 'native');
        }
        if (!counter.isNative()) {
            this.url.addQuery("counter_asset_type", counter.getAssetType());
            this.url.addQuery("counter_asset_code", counter.getCode());
            this.url.addQuery("counter_asset_issuer", counter.getIssuer());
        } else {
            this.url.addQuery("counter_asset_type", 'native');
        }
        return this;
    }
}

