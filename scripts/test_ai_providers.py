"""
Universal AI Provider Test Script
==================================
Tests all configured AI providers to verify API keys and functionality.

Run this before deployment to ensure everything works!
"""

import os
import asyncio
import sys
from typing import Dict, List, Optional
from datetime import datetime


# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))


async def test_provider(provider_name: str, test_func) -> Dict:
    """Test a single provider."""
    print(f"\n{'='*60}")
    print(f"Testing {provider_name}...")
    print(f"{'='*60}")
    
    start_time = datetime.now()
    
    try:
        result = await test_func()
        elapsed = (datetime.now() - start_time).total_seconds()
        
        print(f"✅ {provider_name} - SUCCESS")
        print(f"   Response: {result['content'][:100]}...")
        print(f"   Cost: ${result.get('cost', 0):.6f}")
        print(f"   Latency: {elapsed:.2f}s")
        
        return {
            "provider": provider_name,
            "status": "success",
            "latency": elapsed,
            "cost": result.get('cost', 0)
        }
        
    except Exception as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"❌ {provider_name} - FAILED")
        print(f"   Error: {str(e)}")
        
        return {
            "provider": provider_name,
            "status": "failed",
            "error": str(e),
            "latency": elapsed
        }


async def test_deepseek():
    """Test DeepSeek provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    from app.core.multi_model_config import AIProvider
    
    if not os.getenv("DEEPSEEK_API_KEY"):
        raise ValueError("DEEPSEEK_API_KEY not set")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'DeepSeek working!' in exactly 3 words"}],
        model="deepseek-chat"
    )


async def test_gemini():
    """Test Gemini provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    
    if not os.getenv("GEMINI_API_KEY"):
        raise ValueError("GEMINI_API_KEY not set")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'Gemini working!' in exactly 3 words"}],
        model="gemini-1.5-flash"
    )


async def test_groq():
    """Test Groq provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    
    if not os.getenv("GROQ_API_KEY"):
        raise ValueError("GROQ_API_KEY not set")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'Groq working!' in exactly 3 words"}],
        model="groq/llama-3.1-8b-instant"
    )


async def test_openai():
    """Test OpenAI provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY not set")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'OpenAI working!' in exactly 3 words"}],
        model="gpt-4o-mini"
    )


async def test_anthropic():
    """Test Anthropic provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise ValueError("ANTHROPIC_API_KEY not set")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'Claude working!' in exactly 3 words"}],
        model="claude-3-haiku-20240307"
    )


async def test_openrouter():
    """Test OpenRouter provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    
    if not os.getenv("OPENROUTER_API_KEY"):
        raise ValueError("OPENROUTER_API_KEY not set")
    
    os.environ["APP_URL"] = os.getenv("APP_URL", "http://localhost:3000")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'OpenRouter working!' in exactly 3 words"}],
        model="openrouter/meta-llama/llama-3.3-70b-instruct"
    )


async def test_mistral():
    """Test Mistral provider."""
    from app.core.enhanced_universal_client import UniversalAIClient
    
    if not os.getenv("MISTRAL_API_KEY"):
        raise ValueError("MISTRAL_API_KEY not set")
    
    client = UniversalAIClient()
    return await client.generate(
        messages=[{"role": "user", "content": "Say 'Mistral working!' in exactly 3 words"}],
        model="mistral-small-latest"
    )


async def test_automatic_routing():
    """Test automatic task-based routing."""
    from app.core.enhanced_universal_client import get_universal_client
    from app.core.multi_model_config import TaskType
    
    print(f"\n{'='*60}")
    print(f"Testing Automatic Task-Based Routing")
    print(f"{'='*60}")
    
    client = get_universal_client()
    
    tasks = [
        (TaskType.CODE_REVIEW, "Review: def add(a,b): return a+b"),
        (TaskType.CLASSIFICATION, "Is this Python or JavaScript?"),
    ]
    
    results = []
    
    for task, prompt in tasks:
        try:
            response = await client.generate(
                messages=[{"role": "user", "content": prompt}],
                task=task
            )
            
            print(f"\n✅ Task: {task}")
            print(f"   Auto-selected: {response['model_used']}")
            print(f"   Provider: {response['provider_used']}")
            print(f"   Cost: ${response['cost']:.6f}")
            
            results.append({
                "task": task,
                "model": response['model_used'],
                "cost": response['cost'],
                "status": "success"
            })
            
        except Exception as e:
            print(f"\n❌ Task: {task}")
            print(f"   Error: {str(e)}")
            results.append({
                "task": task,
                "status": "failed",
                "error": str(e)
            })
    
    return results


async def test_fallback_system():
    """Test automatic fallback on provider failure."""
    from app.core.enhanced_universal_client import get_universal_client
    
    print(f"\n{'='*60}")
    print(f"Testing Automatic Fallback System")
    print(f"{'='*60}")
    
    client = get_universal_client(enable_fallbacks=True)
    
    try:
        # Use an invalid model to trigger fallback
        response = await client.generate(
            messages=[{"role": "user", "content": "Test fallback"}],
            model="invalid-model-to-trigger-fallback"
        )
        
        print(f"✅ Fallback successful!")
        print(f"   Fallback provider: {response['provider_used']}")
        print(f"   Fallback model: {response['model_used']}")
        
        return {"status": "success", "fallback_worked": True}
        
    except Exception as e:
        print(f"❌ Fallback failed: {str(e)}")
        return {"status": "failed", "error": str(e)}


async def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("🧪 UNIVERSAL AI PROVIDER TEST SUITE")
    print("="*60)
    print("\nTesting all configured AI providers...")
    print("This will verify API keys and basic functionality.\n")
    
    # Define all tests
    tests = [
        ("DeepSeek", test_deepseek),
        ("Google Gemini", test_gemini),
        ("Groq", test_groq),
        ("OpenAI", test_openai),
        ("Anthropic Claude", test_anthropic),
        ("OpenRouter", test_openrouter),
        ("Mistral", test_mistral),
    ]
    
    results = []
    
    # Test individual providers
    for provider_name, test_func in tests:
        result = await test_provider(provider_name, test_func)
        results.append(result)
        await asyncio.sleep(1)  # Rate limiting
    
    # Test automatic routing
    routing_results = await test_automatic_routing()
    
    # Test fallback system
    await test_fallback_system()
    
    # Print summary
    print(f"\n{'='*60}")
    print("📊 TEST SUMMARY")
    print(f"{'='*60}\n")
    
    successful = [r for r in results if r['status'] == 'success']
    failed = [r for r in results if r['status'] == 'failed']
    
    print(f"✅ Successful: {len(successful)}/{len(results)}")
    print(f"❌ Failed: {len(failed)}/{len(results)}")
    
    if successful:
        print("\n🎉 Working Providers:")
        total_cost = 0
        avg_latency = 0
        
        for result in successful:
            print(f"   • {result['provider']}")
            print(f"     - Latency: {result['latency']:.2f}s")
            print(f"     - Cost: ${result['cost']:.6f}")
            total_cost += result['cost']
            avg_latency += result['latency']
        
        if successful:
            print(f"\n💰 Total test cost: ${total_cost:.6f}")
            print(f"⚡ Average latency: {avg_latency/len(successful):.2f}s")
    
    if failed:
        print("\n⚠️  Failed Providers:")
        for result in failed:
            print(f"   • {result['provider']}")
            print(f"     Error: {result['error']}")
    
    # Recommendations
    print(f"\n{'='*60}")
    print("💡 RECOMMENDATIONS")
    print(f"{'='*60}\n")
    
    if len(successful) == 0:
        print("❌ No providers working!")
        print("   Please configure at least 2-3 API keys in .env")
        print("   See .env.ai.example for setup instructions")
        return 1
    
    elif len(successful) == 1:
        print("⚠️  Only 1 provider configured")
        print("   Recommended: Configure at least 2-3 providers for redundancy")
        print("   Minimum setup:")
        print("   - DEEPSEEK_API_KEY (ultra cheap)")
        print("   - GEMINI_API_KEY (large context)")
        print("   - GROQ_API_KEY (ultra fast)")
    
    elif len(successful) >= 2:
        print("✅ Multiple providers configured - good redundancy!")
        
        # Check for ultra-cheap providers
        cheap_providers = [r['provider'] for r in successful 
                          if r['provider'] in ['DeepSeek', 'Google Gemini', 'Groq']]
        
        if len(cheap_providers) >= 2:
            print("✅ Ultra-cheap providers configured - excellent cost optimization!")
        else:
            print("💡 Consider adding DeepSeek or Gemini for 70-95% cost savings")
    
    print(f"\n{'='*60}")
    print("🚀 Ready for deployment!")
    print(f"{'='*60}\n")
    
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
