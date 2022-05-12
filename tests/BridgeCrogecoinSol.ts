import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { BridgeCrogecoinSol } from "../target/types/bridge_crogecoin_sol";
import {TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createMint, mintTo, getAccount, Account, createApproveInstruction, createTransferInstruction} from "@solana/spl-token";
import { PublicKey, Transaction, SYSVAR_INSTRUCTIONS_PUBKEY  } from "@solana/web3.js"
const assert = require("assert");
const { SystemProgram } = anchor.web3;

describe("BridgeCrogecoinSol", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BridgeCrogecoinSol as Program<BridgeCrogecoinSol>;

  const authority = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const system_wallet = anchor.web3.Keypair.generate();
  const governor_wallet = anchor.web3.Keypair.generate();
  const swapfee_wallet = anchor.web3.Keypair.generate();
  const bridge_account = anchor.web3.Keypair.generate();

  let user_token_account: Account;
  let vault_token_account, bump;
  let swapfee_token_account: Account;

  let token_mint: PublicKey = null;
  
  it("Account and Mint initialize!", async () => {
    async function airdrop(wallet: PublicKey, amount) {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(wallet, amount),
        "confirmed"
      );
    }
    
    await airdrop(authority.publicKey, 1000000000);
    await airdrop(user.publicKey, 1000000000);
    await airdrop(system_wallet.publicKey, 1000000000);
    await airdrop(swapfee_wallet.publicKey, 1000000000);
    await airdrop(governor_wallet.publicKey, 1000000000);

    const system_sol_balance = await provider.connection.getBalance(system_wallet.publicKey);
    console.log("Initial Sol balance of System Account: ", system_sol_balance);

    token_mint = await createMint(provider.connection, authority, authority.publicKey, null, 9);
    console.log(token_mint.toBase58());
    const [_vault_token_account, _bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("CROGE-SPL"))],
      program.programId
    );
    vault_token_account = _vault_token_account;
    bump = bump;

    user_token_account = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      token_mint,
      user.publicKey,
    )

    swapfee_token_account = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      swapfee_wallet,
      token_mint,
      swapfee_wallet.publicKey,
    )

    await mintTo(
      provider.connection,
      authority,
      token_mint,
      user_token_account.address,
      authority.publicKey,
      1000000,
    );
  });

  it("Bridge initialized!", async () => {
    const authority_sol_balance = await provider.connection.getBalance(authority.publicKey);
    console.log("Sol balance of Authority Account: ", authority_sol_balance);

    await program.rpc.initialize({
      accounts: {
        bridgeAccount: bridge_account,
        vaultTokenAccount: vault_token_account,
        authority: authority.publicKey,
        tokenMint: token_mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      instructions: [
        await program.account.bridgeAccount.createInstruction(bridge_account, 20000),
      ],
      signers: [authority, bridge_account]
    })
    const authority_sol_balance1 = await provider.connection.getBalance(authority.publicKey);
    console.log("Sol balance of Authority Account: ", authority_sol_balance1);

    await program.rpc.setSystem(
      system_wallet.publicKey, {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          authority: authority.publicKey,
        },
        signers: [authority]
    });

    await program.rpc.setGovernor(
      governor_wallet.publicKey, {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          authority: authority.publicKey,
        },
        signers: [authority]
    });

    await program.rpc.updateBridgeStatus(
      false, {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          authority: authority.publicKey,
        },
        signers: [authority]
    })

    await program.rpc.setBridgeFeesAddress(
      swapfee_token_account.address, {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          governor: governor_wallet.publicKey,
        },
        signers: [governor_wallet]
    })

    await program.rpc.excludeFromFees(
      user_token_account.address, 
      true,
      {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          governor: governor_wallet.publicKey,
        },
        signers: [governor_wallet]
    })

    program.addEventListener(program.idl.events[0].name, (event: any, slot: number) => {
      console.log("==== Solana Swap Event ====")
      console.log(event);
    })
  });


  it("Bridge Swap!", async () => {
    const tokenAccountInfo = await getAccount(provider.connection, user_token_account.address);
    console.log("Before Swapping Token amount of My Account: ", tokenAccountInfo.amount);
    const tokenVaultAccountInfo = await getAccount(provider.connection, vault_token_account);
    console.log("Before Swapping Token amount of Vault Account: ", tokenVaultAccountInfo.amount);
    const swap_amount = 50000;
    console.log("Swap Amount: ", swap_amount);
    const user_sol_balance = await provider.connection.getBalance(user.publicKey);
    console.log("Before Swapping Sol balance of My Account: ", user_sol_balance);
    const system_sol_balance = await provider.connection.getBalance(system_wallet.publicKey);
    console.log("Before Swapping Sol balance of System Account: ", system_sol_balance);
    
    console.log("User address: ", user.publicKey.toBase58());

    const to_chain_id = 25;
    const to_eth_address = "0x063C8512E1f351d49b5535b2a4B0BC77Da98153A";

    let swap = program.instruction.swap(
      new anchor.BN(swap_amount),
      to_chain_id,
      to_eth_address,
      {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          vaultTokenAccount: vault_token_account,
          user: user.publicKey,
          userTokenAccount: user_token_account.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          system: system_wallet.publicKey,
        }
      }
    )

    try {
      let tx = new Transaction();
      tx.add(swap);
      await provider.sendAndConfirm(tx, [user], {});
    } catch(error) {
      console.log(error);
    }

    const tokenAccountInfoAfterSwap = await getAccount(provider.connection, user_token_account.address);
    console.log("After Swapping Token amount of My Account: ", tokenAccountInfoAfterSwap.amount);

    const tokenVaultAccountInfoAfterSwap = await getAccount(provider.connection, vault_token_account);
    console.log("After Swapping Token amount of Vault Account: ", tokenVaultAccountInfoAfterSwap.amount);

    const user_sol_balanceAfterSwap = await provider.connection.getBalance(user.publicKey);
    console.log("After Swapping Sol balance of My Account: ", user_sol_balanceAfterSwap);
    const system_sol_balanceAfterSwap = await provider.connection.getBalance(system_wallet.publicKey);
    console.log("After Swapping Sol balance of System Account: ", system_sol_balanceAfterSwap);
  });

  it("Bridge SwapBack!", async () => {
    const tokenAccountInfo = await getAccount(provider.connection, user_token_account.address);
    console.log("Before SwapBack Token amount of My Account: ", tokenAccountInfo.amount);
    const tokenFeeAccountInfo = await getAccount(provider.connection, swapfee_token_account.address);
    console.log("Before SwapBack Token amount of SwapFee Account: ", tokenFeeAccountInfo.amount);
    const tokenVaultAccountInfo = await getAccount(provider.connection, vault_token_account);
    console.log("Before SwapBack Token amount of Vault Account: ", tokenVaultAccountInfo.amount);

    const swapback_amount = 50000;
    console.log("SwapBack Amount: ", swapback_amount);
    const from_chain_id = 56;
    const nonce = new anchor.BN(4783738);
    const to = user_token_account.address.toBase58();

    // let ix = createApproveInstruction(
    //   user_token_account.address,
    //   vault_token_account,
    //   user.publicKey,
    //   amount,
    // );
    // program.addEventListener()

    let swap_back = program.instruction.swapBack(
      new anchor.BN(swapback_amount),
      nonce,
      from_chain_id,
      {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          vaultTokenAccount: vault_token_account,
          system: system_wallet.publicKey,
          userTokenAccount:  new PublicKey(to),
          tokenProgram: TOKEN_PROGRAM_ID,
          bridgeFeesAddress: swapfee_token_account.address,
        }
      }
    )

    try {
      let tx = new Transaction();
      tx.add(swap_back);
      await provider.sendAndConfirm(tx, [system_wallet], {});
    } catch(error) {
      console.log(error);
    }

    const tokenAccountInfoAfterSwap = await getAccount(provider.connection, user_token_account.address);
    console.log("After SwapBack Token amount of My Account: ", tokenAccountInfoAfterSwap.amount);

    const tokenFeeAccountInfoAfterSwap = await getAccount(provider.connection, swapfee_token_account.address);
    console.log("After SwapBack Token amount of SwapFee Account: ", tokenFeeAccountInfoAfterSwap.amount);
    
    const tokenVaultAccountInfoAfterSwap = await getAccount(provider.connection, vault_token_account);
    console.log("After SwapBack Token amount of Vault Account: ", tokenVaultAccountInfoAfterSwap.amount);
  });
});

