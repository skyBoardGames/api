import {Request, Response} from 'express';
import {
  calculate_charge,
  create_checkout_url,
  fetch_account_details,
  fetch_banks,
} from '../utils/paystack';
import {handle_error} from '../utils/handle-error';
import USER from '../models/user.model';
import {v4 as uuidv4} from 'uuid';
import TRANSACTION from '../models/transaction.model';
import TRANSACTIONTTL from '../models/transaction-ttl.model';

export function handle_callback(_: Request, res: Response) {
  res.status(200).json({message: 'Transaction completed successfully'});
}

export async function get_banks(_: Request, res: Response) {
  try {
    const data = await fetch_banks();

    if (data.status === false) {
      res.status(400).json({message: 'Something went wrong, try again'});
      return;
    }

    const formatted = data.data.map(({name, code, currency, type}) => ({
      name,
      code,
      currency,
      type,
    }));

    res.status(200).json({message: 'Banks retrieved', data: formatted});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function get_user_bank_details(req: Request, res: Response) {
  try {
    const {bank, accountNumber} = req.params;

    if (typeof bank === 'undefined' || typeof accountNumber === 'undefined') {
      res
        .status(400)
        .json({message: 'Please fill in the account number and bank code'});
      return;
    }

    const data = await fetch_account_details(accountNumber, bank);

    if (data.status === false) {
      res.status(400).json({message: data.message});
      return;
    }

    res.status(200).json({message: 'Bank details retrieved', data: data.data});
  } catch (error: any) {
    handle_error(error, res);
  }
}

export async function get_transfer_charge(req: Request, res: Response) {
  try {
    const {amount} = req.params;

    if (isNaN(+amount) || +amount < 1) {
      res.status(400).json({message: 'Please specify a valid amount'});
      return;
    }

    const charge = calculate_charge(+amount);

    res.status(200).json({message: 'Charge retrieved (in Kobo)', data: charge});
  } catch (error) {
    handle_error(error, res);
  }
}

export async function initialize_deposit(req: Request, res: Response) {
  try {
    const {userId} = req;
    let {amount} = req.body;

    amount = +amount;
    if (isNaN(amount)) {
      res.status(400).json({message: 'Please specify a valid amount'});
      return;
    }

    const MIN_DEPOSIT = 500 * 100; // 500 naira in kobo
    if (amount < MIN_DEPOSIT) {
      res.status(400).json({
        message: `Minimum deposit amount is ${MIN_DEPOSIT / 100} naira`,
      });
      return;
    }

    const userInfo = await USER.findOne({_id: userId});

    if (!userInfo) {
      res.status(404).json({
        message:
          'There were some issues with your account, please sign in again',
      });
      return;
    }

    // create a checkout link for this
    const ref = uuidv4();
    const checkoutUrl = await create_checkout_url(userInfo.email, ref, amount);

    const session = await TRANSACTION.startSession({
      defaultTransactionOptions: {
        readConcern: {level: 'majority'},
        writeConcern: {w: 'majority'},
      },
    });

    await session.withTransaction(async session => {
      try {
        // create a transaction record with pending status
        await TRANSACTION.create(
          [
            {
              ref,
              userId,
              amount,
              fee: 0,
              total: amount,
              type: 'deposit',
            },
          ],
          {session}
        );

        // insert a TTL for the transaction (30 minutes)
        await TRANSACTIONTTL.create([{ref}], {session});

        await session.commitTransaction();

        // return checkout link
        res
          .status(200)
          .json({message: 'Checkout link created', data: checkoutUrl});
      } catch (error) {
        await session.abortTransaction();

        throw error;
      } finally {
        await session.endSession();
      }
    });
  } catch (error) {
    handle_error(error, res);
  }
}