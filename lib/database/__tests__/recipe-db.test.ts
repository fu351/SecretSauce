import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mockRecipe, mockRecipeList, mockRecipeDbRow, mockSimpleRecipe } from '@/test/mocks/data/recipes'

// Mock the Supabase client before importing recipeDB
vi.mock('@/lib/supabase', () => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: vi.fn(), // For promise resolution
  }

  const mockSupabase = {
    from: vi.fn(() => mockQueryBuilder),
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
    },
  }

  return {
    supabase: mockSupabase,
    createServerClient: vi.fn(() => mockSupabase),
  }
})

// Import after mocking
import { supabase } from '@/lib/database/supabase'
import { recipeDB } from '../recipe-db'

// Get references to the mocked functions
const mockSupabase = supabase as any
const getMockQueryBuilder = () => mockSupabase.from()

describe('RecipeDB', () => {
  let mockQueryBuilder: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBuilder = getMockQueryBuilder()

    // Reset the mock query builder defaults
    mockQueryBuilder.then.mockImplementation(() =>
      Promise.resolve({ data: [], error: null })
    )
    mockQueryBuilder.single.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = recipeDB
      const instance2 = recipeDB
      expect(instance1).toBe(instance2)
    })

    it('should have the correct table name', () => {
      expect(recipeDB.tableName).toBe('recipes')
    })
  })

  describe('findById', () => {
    it('should fetch a recipe by id and map fields correctly', async () => {
      const mockData = { ...mockRecipeDbRow }
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockData,
        error: null,
      })

      const result = await recipeDB.findById('recipe-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('recipes')
      expect(mockQueryBuilder.select).toHaveBeenCalledWith('*')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'recipe-123')
      expect(mockQueryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
      expect(result).toBeDefined()
      expect(result?.id).toBe('recipe-123')
      expect(result?.title).toBe('Chocolate Chip Cookies')
      // Test field mapping: cuisine -> cuisine_name
      expect(result?.cuisine_name).toBe('american')
    })

    it('should filter out soft-deleted recipes', async () => {
      await recipeDB.findById('deleted-recipe')

      expect(mockQueryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('should return null when recipe is not found', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      })

      const result = await recipeDB.findById('nonexistent')
      expect(result).toBeNull()
    })

    it('should correctly map content JSONB field', async () => {
      const mockData = {
        ...mockRecipeDbRow,
        content: {
          description: 'Test description',
          image_url: 'https://test.com/image.jpg',
          instructions: [{ step: 1, description: 'Do this' }],
        },
      }

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: mockData,
        error: null,
      })

      const result = await recipeDB.findById('recipe-123')

      expect(result?.content?.description).toBe('Test description')
      expect(result?.content?.image_url).toBe('https://test.com/image.jpg')
      expect(result?.content?.instructions).toHaveLength(1)
    })
  })

  describe('fetchRecipes', () => {
    it('should fetch recipes with default sorting', async () => {
      const mockData = mockRecipeList.map(r => ({
        ...r,
        cuisine: r.cuisine_name,
        deleted_at: null,
      }))

      mockQueryBuilder.then.mockResolvedValueOnce({
        data: mockData,
        error: null,
      })

      const result = await recipeDB.fetchRecipes()

      expect(mockSupabase.from).toHaveBeenCalledWith('recipes')
      expect(mockQueryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('should apply filters correctly', async () => {
      mockQueryBuilder.then.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await recipeDB.fetchRecipes({
        difficulty: 'beginner',
        cuisine: 'italian',
        tags: ['vegan'],
        protein: 'chicken',
        mealType: 'dinner',
      })

      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('difficulty', 'beginner')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('cuisine', 'italian')
      expect(mockQueryBuilder.contains).toHaveBeenCalledWith('tags', ['vegan'])
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('protein', 'chicken')
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('meal_type', 'dinner')
    })

    it('should sort by different fields', async () => {
      mockQueryBuilder.then.mockResolvedValue({
        data: [],
        error: null,
      })

      await recipeDB.fetchRecipes({ sortBy: 'rating_avg' })
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('rating_avg', {
        ascending: false,
        nullsFirst: false,
      })

      vi.clearAllMocks()
      mockQueryBuilder = getMockQueryBuilder()
      mockQueryBuilder.then.mockResolvedValue({ data: [], error: null })

      await recipeDB.fetchRecipes({ sortBy: 'prep_time' })
      expect(mockQueryBuilder.order).toHaveBeenCalledWith('prep_time', { ascending: true })
    })

    it('should apply pagination with range', async () => {
      mockQueryBuilder.then.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await recipeDB.fetchRecipes({ limit: 10, offset: 20 })

      expect(mockQueryBuilder.range).toHaveBeenCalledWith(20, 29)
    })
  })

  describe('insertRecipe', () => {
    it('should transform Recipe type to DB schema', async () => {
      const newRecipe = {
        title: 'New Recipe',
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        difficulty: 'beginner' as const,
        cuisine_name: 'italian',
        ingredients: [{ name: 'pasta', quantity: 1, unit: 'lb' }],
        content: {
          description: 'Test description',
          instructions: [{ step: 1, description: 'Cook it' }],
        },
        tags: ['vegan'],
      }

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { ...newRecipe, id: 'new-id', cuisine: 'italian', deleted_at: null },
        error: null,
      })

      await recipeDB.insertRecipe(newRecipe as any)

      expect(mockQueryBuilder.insert).toHaveBeenCalled()
      const insertedData = mockQueryBuilder.insert.mock.calls[0][0]

      // Verify transformation
      expect(insertedData.cuisine).toBe('italian') // cuisine_name -> cuisine
      expect(insertedData.content.description).toBe('Test description')
      expect(insertedData.deleted_at).toBeNull()
    })

    it('should return null on insert error', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      })

      const result = await recipeDB.insertRecipe({} as any)

      expect(result).toBeNull()
    })
  })

  describe('updateRecipe', () => {
    it('should update a recipe with partial data', async () => {
      const updates = {
        title: 'Updated Title',
        prep_time: 25,
      }

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: {
          ...mockRecipeDbRow,
          ...updates,
        },
        error: null,
      })

      const result = await recipeDB.updateRecipe('recipe-123', updates)

      expect(mockQueryBuilder.update).toHaveBeenCalled()
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'recipe-123')
      expect(mockQueryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
      expect(result?.title).toBe('Updated Title')
    })

    it('should map cuisine_name to cuisine field on update', async () => {
      const updates = {
        cuisine_name: 'french',
      }

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: { ...mockRecipeDbRow, cuisine: 'french' },
        error: null,
      })

      await recipeDB.updateRecipe('recipe-123', updates as any)

      const updateData = mockQueryBuilder.update.mock.calls[0][0]
      expect(updateData.cuisine).toBe('french')
    })
  })

  describe('deleteRecipe', () => {
    it('should soft delete a recipe by setting deleted_at', async () => {
      mockQueryBuilder.then.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await recipeDB.deleteRecipe('recipe-123')

      expect(result).toBe(true)
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted_at: expect.any(String),
        })
      )
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'recipe-123')
      expect(mockQueryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('should return false on delete error', async () => {
      mockQueryBuilder.then.mockResolvedValueOnce({
        data: null,
        error: { message: 'Delete failed' },
      })

      const result = await recipeDB.deleteRecipe('recipe-123')

      expect(result).toBe(false)
    })
  })

  describe('searchRecipes', () => {
    it('should search recipes by title client-side', async () => {
      const recipes = [
        { ...mockRecipeDbRow, title: 'Chocolate Cake' },
        { ...mockRecipeDbRow, title: 'Vanilla Cake', id: 'recipe-2' },
        { ...mockRecipeDbRow, title: 'Apple Pie', id: 'recipe-3' },
      ]

      mockQueryBuilder.then.mockResolvedValueOnce({
        data: recipes,
        error: null,
      })

      const result = await recipeDB.searchRecipes('chocolate')

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Chocolate Cake')
    })

    it('should search in content description', async () => {
      const recipes = [
        {
          ...mockRecipeDbRow,
          content: { description: 'A delicious chocolate dessert', instructions: [] },
        },
      ]

      mockQueryBuilder.then.mockResolvedValueOnce({
        data: recipes,
        error: null,
      })

      const result = await recipeDB.searchRecipes('delicious')

      expect(result.length).toBeGreaterThan(0)
    })

    it('should be case insensitive', async () => {
      const recipes = [{ ...mockRecipeDbRow, title: 'CHOCOLATE COOKIES' }]

      mockQueryBuilder.then.mockResolvedValueOnce({
        data: recipes,
        error: null,
      })

      const result = await recipeDB.searchRecipes('chocolate')

      expect(result).toHaveLength(1)
    })
  })

  describe('Data Mapping', () => {
    it('should correctly map DB schema to Recipe type', async () => {
      const dbRow = {
        id: 'test-id',
        title: 'Test Recipe',
        cuisine: 'mexican', // DB field
        prep_time: 15,
        cook_time: 30,
        servings: 4,
        difficulty: 'intermediate',
        author_id: 'user-123',
        rating_avg: 4.2,
        rating_count: 25,
        ingredients: [{ name: 'tomato', quantity: 2, unit: 'whole' }],
        content: {
          description: 'A test recipe',
          image_url: 'https://example.com/test.jpg',
          instructions: [{ step: 1, description: 'Test step' }],
        },
        nutrition: { calories: 200, protein: 10, carbs: 30, fat: 5 },
        tags: ['vegetarian', 'gluten-free'],
        protein: 'tofu',
        meal_type: 'lunch',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      }

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: dbRow,
        error: null,
      })

      const result = await recipeDB.findById('test-id')

      expect(result).toMatchObject({
        id: 'test-id',
        title: 'Test Recipe',
        cuisine_name: 'mexican', // Mapped from 'cuisine'
        tags: ['vegetarian', 'gluten-free'],
        protein: 'tofu',
        meal_type: 'lunch',
      })
      expect(result?.content?.description).toBe('A test recipe')
    })

    it('should handle null/undefined optional fields', async () => {
      const dbRow = {
        id: 'minimal-recipe',
        title: 'Minimal Recipe',
        prep_time: 10,
        cook_time: 10,
        servings: 2,
        difficulty: 'beginner',
        author_id: 'user-123',
        rating_avg: 0,
        rating_count: 0,
        ingredients: [],
        content: { description: '', instructions: [] },
        tags: [],
        cuisine: null,
        protein: null,
        meal_type: null,
        nutrition: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        deleted_at: null,
      }

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: dbRow,
        error: null,
      })

      const result = await recipeDB.findById('minimal-recipe')

      expect(result).toBeDefined()
      expect(result?.cuisine_name).toBeUndefined()
      expect(result?.protein).toBeUndefined()
      expect(result?.meal_type).toBeUndefined()
    })
  })
})
