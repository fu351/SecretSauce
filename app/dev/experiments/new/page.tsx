"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/database/supabase"

export default function NewExperimentPage() {
  const router = useRouter()
  const createdByUserId = process.env.NEXT_PUBLIC_DEV_EXPERIMENT_CREATED_BY_UUID
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    hypothesis: "",
    target_user_tiers: [] as string[],
    target_anonymous: true,
    traffic_percentage: 100,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        alert("You must be logged in to create an experiment")
        return
      }
      if (!createdByUserId) {
        alert("Missing NEXT_PUBLIC_DEV_EXPERIMENT_CREATED_BY_UUID in environment")
        return
      }

      // Create experiment via RPC or direct insert
      // For now, we'll use a simple approach - you can enhance this later
      const { error } = await supabase.rpc("dev_create_experiment", {
        p_name: formData.name,
        p_description: formData.description,
        p_hypothesis: formData.hypothesis,
        p_target_user_tiers: formData.target_user_tiers.length > 0 ? formData.target_user_tiers : null,
        p_target_anonymous: formData.target_anonymous,
        p_traffic_percentage: formData.traffic_percentage,
        p_created_by: createdByUserId,
      })

      if (error) {
        console.error("Error creating experiment:", error)
        alert("Failed to create experiment: " + error.message)
      } else {
        router.push("/dev/experiments")
      }
    } catch (err) {
      console.error("Exception:", err)
      alert("An error occurred while creating the experiment")
    } finally {
      setLoading(false)
    }
  }

  const tierOptions = ["free", "premium"]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dev/experiments"
          className="mb-4 inline-block text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back to Experiments
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Create New Experiment
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-lg shadow">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Experiment Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., Homepage Hero Test"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="What is this experiment testing?"
            />
          </div>

          {/* Hypothesis */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hypothesis
            </label>
            <textarea
              value={formData.hypothesis}
              onChange={(e) => setFormData({ ...formData, hypothesis: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="If we change X, then Y will happen because Z"
            />
          </div>

          {/* Target User Tiers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target User Tiers
            </label>
            <div className="space-y-2">
              {tierOptions.map((tier) => (
                <label key={tier} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.target_user_tiers.includes(tier)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          target_user_tiers: [...formData.target_user_tiers, tier],
                        })
                      } else {
                        setFormData({
                          ...formData,
                          target_user_tiers: formData.target_user_tiers.filter(
                            (t) => t !== tier
                          ),
                        })
                      }
                    }}
                    className="mr-2 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700 capitalize">{tier}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Leave unchecked to target all tiers
            </p>
          </div>

          {/* Target Anonymous */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.target_anonymous}
                onChange={(e) =>
                  setFormData({ ...formData, target_anonymous: e.target.checked })
                }
                className="mr-2 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                Include anonymous users
              </span>
            </label>
          </div>

          {/* Traffic Percentage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Traffic Percentage: {formData.traffic_percentage}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.traffic_percentage}
              onChange={(e) =>
                setFormData({ ...formData, traffic_percentage: Number(e.target.value) })
              }
              className="w-full"
            />
            <p className="mt-1 text-sm text-gray-500">
              Percentage of users to include in this experiment
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Experiment"}
            </button>
            <Link
              href="/dev/experiments"
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>

          <div className="mt-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> After creating the experiment, you'll need to add
              variants and configure the experiment settings before activating it.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
