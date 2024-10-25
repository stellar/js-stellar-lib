import { HttpClient } from "../http-client";
import { CallBuilder } from "./call_builder";

export class FriendbotBuilder extends CallBuilder<any> {
  constructor(serverUrl: URI, client: HttpClient, address: string) {
    super(serverUrl, client);
    this.url.segment("friendbot");
    this.url.setQuery("addr", address);
  }
}
