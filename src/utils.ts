import { Transaction } from "@stellar/stellar-base";

export class Utils {
  /**
   * Verifies if the current date is within the transaction's timebonds
   *
   * @static
   * @function
   * @param {Transaction} transaction the transaction whose timebonds will be validated.
   * @returns {boolean} returns true if the current time is within the transaction's [minTime, maxTime] range.
   */
  static validateTimebounds(
    transaction: Transaction,
    gracePeriod: number = 0,
  ): boolean {
    if (!transaction.timeBounds) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const { minTime, maxTime } = transaction.timeBounds;

    return (
      now >= Number.parseInt(minTime, 10) - gracePeriod &&
      now <= Number.parseInt(maxTime, 10) + gracePeriod
    );
  }
}
