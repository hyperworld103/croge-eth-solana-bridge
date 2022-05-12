use anchor_lang::{
    prelude::*,
    solana_program::{
        program::{invoke},
        system_instruction,
    },
};
use std::vec;
// use std::collections::BTreeMap;

use anchor_spl::{
    token::{Mint, Token, TokenAccount},
};
declare_id!("25GcePJVF3P4WGfeRyf8stMVkh7vCFjuqi7LbXcaCRbp");

const VAULT_TOKEN_KEY:&[u8] = b"CROGE-SPL";
const BRIDGE_KEY: &[u8] = b"CROGE-BRIGE";
const VAULT_BUMP: u8 = 254;
const SOLANA_CHAIN_ID: u8 = 1;

#[program]
pub mod bridge_crogecoin_sol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let i: usize;
        let bridge_account = &mut ctx.accounts.bridge_account;
        bridge_account.is_bridging_paused = true;
        bridge_account.bridge_fee = 3;
        for i in 0..256 {
            bridge_account.nonces.push(0);
            bridge_account.processed_fees.push(0);
            bridge_account.last_nonce_processed.push(0);
        }
        bridge_account.processed_fees[25] = 10000000; // 0.01 SOL

        // bridge_account.system = Pubkey::new("J14a2c2MSAkw39dFdUMFEEU9b528cPiKhpfM1LnpsQpQ".as_bytes());
        // bridge_account.governor = Pubkey::new("J14a2c2MSAkw39dFdUMFEEU9b528cPiKhpfM1LnpsQpQ".as_ref());
        // bridge_account.bridge_fees_address = Pubkey::new("J14a2c2MSAkw39dFdUMFEEU9b528cPiKhpfM1LnpsQpQ".as_ref());

        bridge_account.authority = ctx.accounts.authority.key();
        bridge_account.token_mint = ctx.accounts.token_mint.key();
        Ok(())
    }

    pub fn exclude_from_fees(ctx: Context<UpdateGovernor>, account: Pubkey, exclude: bool) -> Result<()> {
        let index: usize = ctx.accounts.bridge_account.find_excluded_from_fees(&account);
        let is_exist =  index < ctx.accounts.bridge_account.excluded_from_fees.len();
        if is_exist ^ exclude == true {
            if exclude == true {
                ctx.accounts.bridge_account.excluded_from_fees.push(account);
            } else {
                ctx.accounts.bridge_account.excluded_from_fees.remove(index);
            }
        }
        Ok(())
    }
   
    pub fn set_bridge_fee(ctx: Context<UpdateGovernor>, bridge_fee: u64) -> Result<()> {
        ctx.accounts.bridge_account.bridge_fee = bridge_fee;
        Ok(())
    }

    pub fn set_governor(ctx: Context<UpdateOwner>, governor: Pubkey) -> Result<()> {
        ctx.accounts.bridge_account.governor = governor;
        Ok(())
    }

    pub fn set_bridge_fees_address(ctx: Context<UpdateGovernor>, bridge_fees_address: Pubkey) -> Result<()> {
        ctx.accounts.bridge_account.bridge_fees_address = bridge_fees_address;
        Ok(())
    }

    pub fn update_bridge_status(ctx: Context<UpdateOwner>, paused: bool) -> Result<()> {
        ctx.accounts.bridge_account.is_bridging_paused = paused;
        Ok(())
    }

    pub fn set_processed_fess(ctx: Context<UpdateOwner>, chain_id: u8, processed_fees: u64) -> Result<()> {
        ctx.accounts.bridge_account.processed_fees[chain_id as usize] = processed_fees;
        Ok(())
    }

    pub fn set_system(ctx: Context<UpdateOwner>, system: Pubkey) -> Result<()> {
        ctx.accounts.bridge_account.system = system;
        Ok(())
    }

    pub fn swap(ctx: Context<Swap>, amount: u64, to_chain_id: u8, to_eth_address: String) -> Result<()> {
        let bridge_account = &mut ctx.accounts.bridge_account;
        let processed_fee = bridge_account.processed_fees[to_chain_id as usize];
        let mut nonce: u128 = bridge_account.nonces[to_chain_id as usize];
        nonce = nonce + 1;
        bridge_account.nonces[to_chain_id as usize] = nonce;
        
        if ctx.accounts.user.lamports() < processed_fee {
            return Err(error!(ErrorCode::InsufficientProcessedFees));
        }

        invoke(
            &system_instruction::transfer(&ctx.accounts.user.key(), &ctx.accounts.system.key(), processed_fee),
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.system.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;
        emit!(SwapRequest{
            to_chain_id: to_chain_id,
            amount: amount,
            nonce: nonce,
            to_eth_address: to_eth_address.clone(),
            from_token_address: ctx.accounts.user_token_account.to_account_info().key().to_string()
        });

        Ok(())
    }

    pub fn swap_back(ctx: Context<SwapBack>, amount: u64, nonce: u128, from_chain_id: u8) -> Result<()> {
        let bridge_account = &mut ctx.accounts.bridge_account;
        if bridge_account.last_nonce_processed[from_chain_id as usize] >= nonce {
            return Err(error!(ErrorCode::SwapedAlready));
        }

        bridge_account.last_nonce_processed[from_chain_id as usize] = nonce;
        let user_token_address: &Pubkey = ctx.accounts.user_token_account.to_account_info().key;
        
        let mut bridge_fee = bridge_account.bridge_fee;
        if bridge_account.find_excluded_from_fees(user_token_address) < bridge_account.excluded_from_fees.len() {
            bridge_fee = 0;
        }
       
        let amount_after_fee = amount - amount * bridge_fee / 1000;
        let temp = amount - amount_after_fee;

        if temp > 0 {
            anchor_spl::token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.vault_token_account.to_account_info(),
                        to: ctx.accounts.bridge_fees_address.to_account_info(),
                        authority: ctx.accounts.vault_token_account.to_account_info(),
                    },
                    &[&[
                        VAULT_TOKEN_KEY.as_ref(),
                        &[VAULT_BUMP],
                    ]],
                ),
                temp,
            )?;
        }

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault_token_account.to_account_info(),
                },
                &[&[
                    VAULT_TOKEN_KEY.as_ref(),
                    &[VAULT_BUMP],
                ]],
            ),
            amount_after_fee,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut, has_one = system, constraint = bridge_account.is_bridging_paused == false)]
    pub bridge_account: Account<'info, BridgeAccount>,
    #[account(
        mut, 
        seeds = [VAULT_TOKEN_KEY.as_ref()],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    #[account(mut)]
    /// CHECK:` doc comment explaining why no checks through types are necessary.
    pub system: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SwapBack<'info> {
    #[account(mut, has_one = bridge_fees_address, has_one = system, constraint = bridge_account.is_bridging_paused == false)]
    pub bridge_account: Account<'info, BridgeAccount>,

    #[account(
        mut, 
        seeds = [VAULT_TOKEN_KEY.as_ref()],
        bump,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub system: Signer<'info>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub bridge_fees_address: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut, has_one = authority)]
    pub bridge_account: Account<'info, BridgeAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateGovernor<'info> {
    #[account(mut, has_one = governor)]
    pub bridge_account: Account<'info, BridgeAccount>,
    pub governor: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateSystem<'info> {
    #[account(mut, has_one = system)]
    pub bridge_account: Account<'info, BridgeAccount>,
    pub system: Signer<'info>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    //, rent_exempt = skip, constraint = bridge_account.to_account_info().owner == program_id 
    #[account(zero)]
    pub bridge_account: Account<'info, BridgeAccount>,

    #[account(
        init,
        payer = authority,
        seeds = [VAULT_TOKEN_KEY.as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = vault_token_account,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct BridgeAccount {
    pub authority: Pubkey,
    pub system: Pubkey,
    pub governor: Pubkey,
    pub bridge_fees_address: Pubkey,
    pub token_mint: Pubkey,

    pub last_nonce_processed: Vec<u128>,
    pub nonces: Vec<u128>,
    pub processed_fees: Vec<u64>,
    pub excluded_from_fees: Vec<Pubkey>,
    pub bridge_fee: u64,
    pub is_bridging_paused:bool,
}

impl BridgeAccount {
    const SIZE: usize = 
        32 * 5 +    // authority, system, governor, bridge_fees_address, token_mint SIZE
        16 * 256 +  // last_nonce_processed SIZE
        16 * 256 +  // nonces SIZE
        8 * 256 +   // processed_fees SIZE
        32 * 50 +   // excluded_from_fees SIZE
        8 +         // bridge_fee SIZE
        1           // is_bridging_paused SIZE
    ;
}

impl BridgeAccount {
    pub fn find_excluded_from_fees(&self, address: &Pubkey) -> usize {
        let i: usize;
        for i in 0..self.excluded_from_fees.len() {
            if self.excluded_from_fees[i].eq(address) {
                return i;
            }
        }
        self.excluded_from_fees.len()
    }
}

#[event]
pub struct SwapRequest {
    pub amount: u64,
    pub to_chain_id: u8,
    pub nonce: u128,
    pub to_eth_address: String,
    pub from_token_address: String,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Swap is already proceeds")]
    SwapedAlready,
    #[msg("Insufficient processed fees")]
    InsufficientProcessedFees,
}


