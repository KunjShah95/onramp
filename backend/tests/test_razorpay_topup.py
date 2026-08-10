"""Credit wallet top-up via Razorpay orders and payment signature verification."""
from unittest.mock import MagicMock, patch
import pytest
from app.services.billing_service import BillingService


@pytest.fixture
def service(monkeypatch):
    monkeypatch.setenv("RAZORPAY_KEY_ID", "rzp_test_dummy")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "rzp_test_secret")
    return BillingService()


class TestCreatePaymentOrder:
    async def test_disabled_returns_stub(self, service, monkeypatch):
        monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
        result = await service.create_payment_order("user_1", 500)
        assert result == {"error": "Razorpay is not configured", "stub": True}

    async def test_creates_order_with_paise_amount(self, service):
        mock_order = MagicMock()
        mock_order.get.side_effect = lambda k, d=None: {"id": "order_test", "status": "created"}.get(k, d)
        mock_client = MagicMock()
        mock_client.order.create.return_value = mock_order
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.create_payment_order("user_1", 500)
        assert result["order_id"] == "order_test"
        assert result["amount"] == 50000  # 500 INR -> 50000 paise
        assert result["currency"] == "INR"
        assert result["key_id"] == "rzp_test_dummy"
        mock_client.order.create.assert_called_once()
        assert mock_client.order.create.call_args[0][0]["amount"] == 50000

    async def test_rejects_nonpositive_amount(self, service):
        result = await service.create_payment_order("user_1", 0)
        assert "error" in result


class TestVerifyPaymentOrder:
    async def test_valid_signature_credits_wallet(self, service):
        await service.storage.create_document("credit_topup_orders", "order_1", {
            "order_id": "order_1", "team_id": "user_1", "amount_inr": 500,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        mock_client.payment.fetch.return_value = {"id": "pay_1", "amount": 50000, "status": "captured"}  # 500 INR
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_1", "pay_1", "sig_1")
        assert result == {"credited": True, "credits": 500}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_1")
        assert wallet["balance"] == 500

    async def test_invalid_signature_no_credit(self, service):
        await service.storage.create_document("credit_topup_orders", "order_2", {
            "order_id": "order_2", "team_id": "user_2", "amount_inr": 100,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.side_effect = Exception("bad signature")
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_2", "pay_2", "sig_bad")
        assert result == {"error": "Invalid payment signature"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_2")
        assert wallet["balance"] == 0

    async def test_caller_not_owner_is_rejected(self, service):
        await service.storage.create_document("credit_topup_orders", "order_owner", {
            "order_id": "order_owner", "team_id": "victim_uid", "amount_inr": 100,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order(
                "order_owner", "pay_owner", "sig_ok", caller_id="attacker_uid"
            )
        assert result == {"error": "Not authorized for this order"}
        mock_client.utility.verify_payment_signature.assert_not_called()

    async def test_owner_can_verify(self, service):
        await service.storage.create_document("credit_topup_orders", "order_own", {
            "order_id": "order_own", "team_id": "user_own", "amount_inr": 250,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        mock_client.payment.fetch.return_value = {"id": "pay_own", "amount": 25000, "status": "captured"}  # 250 INR
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order(
                "order_own", "pay_own", "sig_ok", caller_id="user_own"
            )
        assert result == {"credited": True, "credits": 250}

    async def test_double_verify_credits_once(self, service):
        await service.storage.create_document("credit_topup_orders", "order_3", {
            "order_id": "order_3", "team_id": "user_3", "amount_inr": 200,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        mock_client.payment.fetch.return_value = {"id": "pay_3", "amount": 20000, "status": "captured"}  # 200 INR
        with patch.object(service, "_razorpay", return_value=mock_client):
            await service.verify_payment_order("order_3", "pay_3", "sig_3")
            await service.verify_payment_order("order_3", "pay_3", "sig_3")
        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_3")
        assert wallet["balance"] == 200

    async def test_payment_amount_mismatch_is_not_credited(self, service):
        await service.storage.create_document("credit_topup_orders", "order_mm", {
            "order_id": "order_mm", "team_id": "user_mm", "amount_inr": 500, "amount_paise": 50000,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        # Attacker-style: valid signature, but the captured payment is ₹1 not ₹500.
        mock_client.payment.fetch.return_value = {"id": "pay_mm", "amount": 100, "status": "captured"}
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_mm", "pay_mm", "sig_mm")
        assert result == {"error": "Could not credit wallet"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_mm")
        assert wallet["balance"] == 0

    async def test_payment_fetch_failure_is_fail_closed(self, service):
        await service.storage.create_document("credit_topup_orders", "order_fetch", {
            "order_id": "order_fetch", "team_id": "user_fetch", "amount_inr": 100,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        mock_client.payment.fetch.side_effect = Exception("razorpay api down")
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_fetch", "pay_fetch", "sig_fetch")
        assert result == {"error": "Could not verify payment amount"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_fetch")
        assert wallet["balance"] == 0

    async def test_uncaptured_payment_is_not_credited(self, service):
        await service.storage.create_document("credit_topup_orders", "order_auth", {
            "order_id": "order_auth", "team_id": "user_auth", "amount_inr": 100, "amount_paise": 10000,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        # Authorized but not captured — mirrors the webhook crediting only on
        # payment.captured.
        mock_client.payment.fetch.return_value = {"id": "pay_auth", "amount": 10000, "status": "authorized"}
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_auth", "pay_auth", "sig_auth")
        assert result == {"error": "Could not verify payment amount"}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_auth")
        assert wallet["balance"] == 0

    async def test_matching_stored_amount_credits(self, service):
        # Production orders (created via create_payment_order) store amount_paise;
        # a fetched payment matching that amount credits normally.
        await service.storage.create_document("credit_topup_orders", "order_match", {
            "order_id": "order_match", "team_id": "user_match", "amount_inr": 300, "amount_paise": 30000,
        })
        mock_client = MagicMock()
        mock_client.utility.verify_payment_signature.return_value = True
        mock_client.payment.fetch.return_value = {"id": "pay_match", "amount": 30000, "status": "captured"}
        with patch.object(service, "_razorpay", return_value=mock_client):
            result = await service.verify_payment_order("order_match", "pay_match", "sig_match")
        assert result == {"credited": True, "credits": 300}

        from app.services.credit_service import CreditService
        wallet = await CreditService().get_wallet("user_match")
        assert wallet["balance"] == 300
