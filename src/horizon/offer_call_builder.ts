import { Asset } from "@stellar/stellar-base";
import { CallBuilder } from "./call_builder";
import { ServerApi } from "./server_api";
import { HttpClient } from "../http-client";

/**
 * Creates a new {@link OfferCallBuilder} pointed to server defined by serverUrl.
 *
 * Do not create this object directly, use {@link Horizon.Server#offers}.
 *
 * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/offers/|Offers}
 *
 * @augments CallBuilder
 * @private
 * @class
 * @param {string} serverUrl Horizon server URL.
 */
export class OfferCallBuilder extends CallBuilder<
  ServerApi.CollectionPage<ServerApi.OfferRecord>
> {
  constructor(serverUrl: URI, client: HttpClient) {
    super(serverUrl, client, "offers");
    this.url.segment("offers");
  }

  /**
   * The offer details endpoint provides information on a single offer. The offer ID provided in the id
   * argument specifies which offer to load.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/offers/single/|Offer Details}
   * @param {string} offerId Offer ID
   * @returns {CallBuilder<ServerApi.OfferRecord>} CallBuilder<ServerApi.OfferRecord> OperationCallBuilder instance
   */
  public offer(offerId: string): CallBuilder<ServerApi.OfferRecord> {
    const builder = new CallBuilder<ServerApi.OfferRecord>(this.url.clone(), this.httpClient);
    builder.filter.push([offerId]);
    return builder;
  }

  /**
   * Returns all offers where the given account is involved.
   *
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/accounts/offers/|Offers}
   * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {OfferCallBuilder} current OfferCallBuilder instance
   */
  public forAccount(id: string): this {
    return this.forEndpoint("accounts", id);
  }

  /**
   * Returns all offers buying an asset.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/offers/list/|Offers}
   * @see Asset
   * @param {Asset} asset For example: `new Asset('USD','GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD')`
   * @returns {OfferCallBuilder} current OfferCallBuilder instance
   */
  public buying(asset: Asset): this {
    if (!asset.isNative()) {
      this.url.setQuery("buying_asset_type", asset.getAssetType());
      this.url.setQuery("buying_asset_code", asset.getCode());
      this.url.setQuery("buying_asset_issuer", asset.getIssuer());
    } else {
      this.url.setQuery("buying_asset_type", "native");
    }
    return this;
  }

  /**
   * Returns all offers selling an asset.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/offers/list/|Offers}
   * @see Asset
   * @param {Asset} asset For example: `new Asset('EUR','GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD')`
   * @returns {OfferCallBuilder} current OfferCallBuilder instance
   */
  public selling(asset: Asset): this {
    if (!asset.isNative()) {
      this.url.setQuery("selling_asset_type", asset.getAssetType());
      this.url.setQuery("selling_asset_code", asset.getCode());
      this.url.setQuery("selling_asset_issuer", asset.getIssuer());
    } else {
      this.url.setQuery("selling_asset_type", "native");
    }
    return this;
  }

  /**
   * This endpoint filters offers where the given account is sponsoring the offer entry.
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/get-all-offers|Offers}
   * @param {string} id For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {OfferCallBuilder} current OfferCallBuilder instance
   */
  public sponsor(id: string): this {
    this.url.setQuery("sponsor", id);
    return this;
  }

  /**
   * This endpoint filters offers where the given account is the seller.
   *
   * @see {@link https://developers.stellar.org/docs/data/horizon/api-reference/resources/get-all-offers|Offers}
   * @param {string} seller For example: `GDGQVOKHW4VEJRU2TETD6DBRKEO5ERCNF353LW5WBFW3JJWQ2BRQ6KDD`
   * @returns {OfferCallBuilder} current OfferCallBuilder instance
   */
  public seller(seller: string): this {
    this.url.setQuery("seller", seller);
    return this;
  }
}
